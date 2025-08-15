// services/attendanceSync.service.mjs

import Attendance from "../models/attendance.model.mjs";
import Projects from "../models/projects.models.mjs";
import SyncMetadata from "../models/syncMetadata.model.mjs";

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
export const AttendanceSyncService = {
  /**
   * Incrementally pull Attendance__c changes for a project,
   * then bulk upsert into Postgres.
   */
  async syncFromSalesforce(projectId, conn) {
    // 1) Load or init metadata row
    let meta = await SyncMetadata.findOne({
      where: { objectName: "Attendance__c", projectId },
    });
    if (!meta) {
      meta = await SyncMetadata.create({
        objectName: "Attendance__c",
        projectId,
        lastSyncedAt: null,
      });
    }

    // 2) Build SOQL filter on LastModifiedDate
    const lastSync = meta.lastSyncedAt;
    const dateFilter = lastSync
      ? `AND LastModifiedDate > ${lastSync.toISOString()}`
      : "";

    const soql = `
      SELECT Id, Name, Participant__c, Participant_Gender__c, Attended__c,
             Training_Session__c, Date__c,
             Training_Session__r.Training_Module__r.Module_Title__c,
             Training_Session__r.Training_Module__r.Module_Number__c,
             Training_Session__r.Training_Module__c,
             LastModifiedDate
      FROM Attendance__c
      WHERE Training_Session__r.Training_Group__r.Project__c = '${projectId}'
        ${dateFilter}
      ORDER BY LastModifiedDate ASC
    `;

    const project = await Projects.findOne({
      where: { sf_project_id: projectId },
    });

    // 3) Fetch incremental updates
    let result = await conn.query(soql);
    const total = result.totalSize;
    let records = result.records;
    let fetched = records.length;
    console.log(
      `Project ${project.project_name} (${projectId}): fetched ${fetched}/${total}`
    );
    while (!result.done) {
      result = await conn.queryMore(result.nextRecordsUrl);
      records = records.concat(result.records);
      fetched += result.records.length;
      console.log(
        `Project ${project.project_name} (${projectId}): fetched ${fetched}/${total}`
      );
    }

    if (!records.length) {
      console.log("No new Attendance__c changes since", lastSync);
      return;
    }

    console.log(`Found ${records.length} new records for project ${projectId}`);

    // 4) Transform into plain objects for bulkCreate
    const rows = records.map((r) => ({
      salesforceId: r.Id,
      projectId,
      name: r.Name,
      participantId: r.Participant__c,
      participantGender: r.Participant_Gender__c,
      attended: r.Attended__c === 1,
      trainingSessionId: r.Training_Session__c,
      date: r.Date__c,
      moduleName: r.Training_Session__r?.Training_Module__r?.Module_Title__c,
      moduleNumber: r.Training_Session__r?.Training_Module__r?.Module_Number__c,
      moduleId: r.Training_Session__r?.Training_Module__c,
      sendToSalesforce: false,
    }));

    // 5) Bulk upsert in batches of 3000
    let processed = 0;
    const batches = chunkArray(rows, 3000);
    for (const batch of batches) {
      await Attendance.bulkCreate(batch, {
        updateOnDuplicate: [
          "projectId",
          "name",
          "participantId",
          "participantGender",
          "attended",
          "trainingSessionId",
          "date",
          "moduleName",
          "moduleNumber",
          "moduleId",
          "sendToSalesforce",
        ],
      });

      processed += batch.length;
      console.log(`Project ${projectId}: upserted ${processed}/${rows.length}`);
    }

    // 6) Update watermark
    const maxSync = records
      .map((r) => new Date(r.LastModifiedDate))
      .reduce((a, b) => (a > b ? a : b), lastSync || new Date(0));

    meta.lastSyncedAt = maxSync;
    await meta.save();

    console.log(
      `Upserted ${
        rows.length
      } rows; updated lastSyncedAt = ${maxSync.toISOString()}`
    );
  },

  /**
   * Push local Postgres changes (send_to_salesforce = true) back to Salesforce.
   */
  async syncToSalesforce() {
    const pending = await Attendance.findAll({
      where: { sendToSalesforce: true },
    });

    for (const rec of pending) {
      const payload = {
        Id: rec.salesforceId,
        Attended__c: rec.attended ? 1 : 0,
        // add other updated fields here
      };

      if (rec.salesforceId) {
        await conn.sobject("Attendance__c").update(payload);
      } else {
        const { id } = await conn.sobject("Attendance__c").create(payload);
        rec.salesforceId = id;
      }

      rec.sendToSalesforce = false;
      await rec.save();
    }

    console.log(`Pushed ${pending.length} local changes to Salesforce`);
  },
};
