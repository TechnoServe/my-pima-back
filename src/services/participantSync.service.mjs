// services/participantSync.service.mjs
import { Op } from "sequelize";
import Participant from "../models/participant.model.mjs";
import Projects from "../models/projects.models.mjs";
import SyncMetadata from "../models/syncMetadata.model.mjs";
import sequelize from "../config/db.mjs";

/** simple chunker */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size)
    chunks.push(arr.slice(i, i + size));
  return chunks;
}

/** Resolve friendly location name for a participant row (matches your earlier logic) */
function resolveLocationName(row, projectLocationMap) {
  if (
    row.Training_Group__r?.Project__r?.Project_Country__c ===
    "a072400000eenMpAAI"
  ) {
    return row.Training_Group__r?.Location__r?.Name || "N/A";
  }
  const plId = row.Training_Group__r?.Project_Location__c;
  return projectLocationMap.get(plId) || "N/A";
}

/** Build the Postgres-ready participant object (attribute names match Participant model) */
function mapSfParticipantToPg(
  row,
  projectId,
  projectLocationMap,
  reportsToMap
) {
  const coffeeTreeNumbers = row.Household__r?.Farm_Size__c ?? null;
  const hhNumber = row.Household__r?.Name ?? null;

  const reportsToId = row.Training_Group__r?.Responsible_Staff__r?.ReportsToId;
  const businessAdvisor = reportsToId
    ? reportsToMap.get(reportsToId) || null
    : null;

  const location = resolveLocationName(row, projectLocationMap);

  return {
    // keys
    salesforceId: row.Id || null,
    projectId,
    tnsId: row.TNS_Id__c ?? null,

    // names
    firstName: row.Name ?? null,
    middleName: row.Middle_Name__c ?? null,
    lastName: row.Last_Name__c ?? null,

    // demographics
    gender: row.Gender__c ?? null,
    age: row.Age__c ?? null,

    // household / TG
    coffeeTreeNumbers: coffeeTreeNumbers ?? null,
    hhNumber: hhNumber ?? null,
    ffgId: row.Training_Group__r?.TNS_Id__c ?? null,
    location,
    status: row.Status__c ?? null,
    farmerTrainer: row.Trainer_Name__c ?? null,
    businessAdvisor,
    trainingGroup: row.Training_Group__c ?? null,
    householdId: row.Household__c ?? null,

    // misc
    primaryHouseholdMember: row.Primary_Household_Member__c === "Yes" ? 1 : 2,
    createInCommcare: !!row.Create_In_CommCare__c,
    otherIdNumber: row.Other_ID_Number__c ?? null,
    phoneNumber: row.Phone_Number__c ?? null,
    numberOfCoffeePlots: row.Household__c
      ? row.Household__r.Number_of_Coffee_Plots__c === "null" ||
        row.Household__r.Number_of_Coffee_Plots__c === "" ||
        row.Household__r.Number_of_Coffee_Plots__c === null
        ? row.Number_of_Coffee_Plots__c
        : row.Household__r.Number_of_Coffee_Plots__c
      : "ERROR HERE! Please report to the PIMA team",

    // watermark + push flag
    lastModifiedDate: new Date(row.LastModifiedDate),
    sendToSalesforce: false, // always false for SF→PG
  };
}

/** Load all contacts and project locations into maps (ID -> Name) */
async function loadReferenceMaps(conn) {
  const plMap = new Map();
  {
    let res = await conn.query(
      `SELECT Id, Location__r.Name FROM Project_Location__c`
    );
    res.records.forEach((r) => plMap.set(r.Id, r.Location__r?.Name || null));
    while (!res.done) {
      res = await conn.queryMore(res.nextRecordsUrl);
      res.records.forEach((r) => plMap.set(r.Id, r.Location__r?.Name || null));
    }
  }

  const contactMap = new Map();
  {
    let res = await conn.query(`SELECT Id, Name FROM Contact`);
    res.records.forEach((r) => contactMap.set(r.Id, r.Name || null));
    while (!res.done) {
      res = await conn.queryMore(res.nextRecordsUrl);
      res.records.forEach((r) => contactMap.set(r.Id, r.Name || null));
    }
  }

  return { projectLocationMap: plMap, reportsToMap: contactMap };
}

/** Read or create the SyncMetadata row (objectName=Participant__c) */
async function ensureSyncMeta(projectId) {
  let meta = await SyncMetadata.findOne({
    where: { objectName: "Participant__c", projectId },
  });
  if (!meta) {
    meta = await SyncMetadata.create({
      objectName: "Participant__c",
      projectId,
      lastSyncedAt: null,
    });
  }
  return meta;
}

/** Compose the SOQL for full / incremental */
function buildParticipantSoql(projectName, statusClause, lastSyncedAt) {
  const dateFilter = lastSyncedAt
    ? `AND LastModifiedDate > ${lastSyncedAt.toISOString()}`
    : "";

  return `
    SELECT Id, Name, Middle_Name__c, Last_Name__c, Gender__c, Age__c,
           Household__r.Farm_Size__c, Household__r.Name,
           Training_Group__r.TNS_Id__c,
           Training_Group__r.Project_Location__c,
           Training_Group__r.Location__r.Name,
           Training_Group__r.Project__r.Project_Country__c,
           TNS_Id__c, Status__c, Trainer_Name__c,
           Project__c, Training_Group__c,
           Training_Group__r.Responsible_Staff__r.ReportsToId,
           Household__c, Primary_Household_Member__c,
           Create_In_CommCare__c, Other_ID_Number__c,
           Phone_Number__c, Number_of_Coffee_Plots__c,
           Household__r.Number_of_Coffee_Plots__c,
           LastModifiedDate
    FROM Participant__c
    WHERE Project__c = '${projectName}'
      ${statusClause}
      ${dateFilter}
    ORDER BY LastModifiedDate ASC
  `;
}

/** Decide status filter exactly as you did before */
function statusFilterForProject(sfProjectId) {
  if (sfProjectId === "a0EOj000003TZQTMA4") {
    return "";
  }
  return "AND Status__c = 'Active'";
}

/* ------------------------- SMART UPSERT (no dup tns) ------------------------- */

// fields we allow to change on update
const UPDATE_FIELDS = [
  "projectId",
  "tnsId",
  "firstName",
  "middleName",
  "lastName",
  "gender",
  "age",
  "coffeeTreeNumbers",
  "hhNumber",
  "ffgId",
  "location",
  "status",
  "farmerTrainer",
  "businessAdvisor",
  "trainingGroup",
  "householdId",
  "primaryHouseholdMember",
  "createInCommcare",
  "otherIdNumber",
  "phoneNumber",
  "numberOfCoffeePlots",
  "lastModifiedDate",
  "sendToSalesforce",
  "salesforceId", // let us attach SF Id when matching by TNS
];

/**
 * Smart upsert with TNS takeover:
 * - If SF match → update by that row
 * - Else if TNS match:
 *    * If the matched row is INACTIVE and incoming is ACTIVE with a different SF → TAKEOVER:
 *        - set oldRow.tnsId = NULL (free the unique key)
 *        - then create/update incoming row with that TNS
 *    * else → update that row
 * - Else → create
 */
export async function upsertParticipantsSmart(rows) {
  if (!rows.length) return { created: 0, updated: 0, reassignments: 0 };

  // Gather keys
  const sfIds = Array.from(
    new Set(rows.map((r) => r.salesforceId).filter(Boolean))
  );
  const tnsIds = Array.from(new Set(rows.map((r) => r.tnsId).filter(Boolean)));

  // Load potential matches (need status for takeover logic)
  const [bySf, byTns] = await Promise.all([
    sfIds.length
      ? Participant.findAll({
          attributes: [
            "id",
            "salesforceId",
            "tnsId",
            "status",
            "lastModifiedDate",
          ],
          where: { salesforceId: { [Op.in]: sfIds } },
          raw: true,
        })
      : [],
    tnsIds.length
      ? Participant.findAll({
          attributes: [
            "id",
            "salesforceId",
            "tnsId",
            "status",
            "lastModifiedDate",
          ],
          where: { tnsId: { [Op.in]: tnsIds } },
          raw: true,
        })
      : [],
  ]);

  const mapBySf = new Map(bySf.map((x) => [x.salesforceId, x]));
  const mapByTns = new Map(byTns.map((x) => [x.tnsId, x]));

  let created = 0,
    updated = 0,
    reassignments = 0;

  // Process in chunks inside a transaction so takeover is atomic
  for (const batch of chunkArray(rows, 2000)) {
    await sequelize.transaction(async (t) => {
      const creates = [];
      const updates = [];

      for (const incoming of batch) {
        const incomingStatus = (incoming.status || "").toLowerCase(); // "Active" | "Inactive" etc.
        const sfMatch = incoming.salesforceId
          ? mapBySf.get(incoming.salesforceId)
          : null;
        const tnsMatch = incoming.tnsId ? mapByTns.get(incoming.tnsId) : null;

        if (sfMatch) {
          // Update by SF
          updates.push({ id: sfMatch.id, ...incoming });
          continue;
        }

        if (tnsMatch) {
          const tnsIsInactive =
            (tnsMatch.status || "").toLowerCase() === "inactive";
          const isDifferentPerson =
            incoming.salesforceId &&
            incoming.salesforceId !== tnsMatch.salesforceId;

          // TAKEOVER: free the old inactive holder, give TNS to the new active participant
          if (
            tnsIsInactive &&
            isDifferentPerson &&
            incomingStatus === "active"
          ) {
            await Participant.update(
              { tnsId: null }, // free the unique key
              { where: { id: tnsMatch.id }, transaction: t }
            );
            // reflect the change in our in-memory map to prevent double-conflicts in this txn
            mapByTns.delete(tnsMatch.tnsId);
            reassignments += 1;

            // If we separately have a row by SF, update it; else create a new one
            const sfAgain = incoming.salesforceId
              ? mapBySf.get(incoming.salesforceId)
              : null;
            if (sfAgain) {
              updates.push({ id: sfAgain.id, ...incoming });
            } else {
              creates.push(incoming);
            }
            continue;
          }

          // Normal case: keep updating the existing TNS row
          updates.push({ id: tnsMatch.id, ...incoming });
          continue;
        }

        // Brand new
        creates.push(incoming);
      }

      // Bulk CREATE (unique on tns_id is safe because we freed on takeover)
      if (creates.length) {
        for (const c of chunkArray(creates, 3000)) {
          await Participant.bulkCreate(c, {
            transaction: t,
            logging: false,
            validate: false,
          });
          created += c.length;
        }
      }

      // Bulk UPDATE by primary key
      if (updates.length) {
        for (const u of chunkArray(updates, 3000)) {
          await Participant.bulkCreate(u, {
            updateOnDuplicate: UPDATE_FIELDS,
            transaction: t,
            logging: false,
            validate: false,
          });
          updated += u.length;
        }
      }
    });
  }

  return { created, updated, reassignments };
}

/* --------------------------------- service -------------------------------- */

export const ParticipantSyncService = {
  async fullRefresh(conn, projectId, onProgress = () => {}) {
    const project = await Projects.findOne({
      where: { sf_project_id: projectId },
      attributes: ["sf_project_id", "project_name"],
    });
    if (!project) throw new Error(`Project ${projectId} not found in DB`);

    const { projectLocationMap, reportsToMap } = await loadReferenceMaps(conn);
    const meta = await ensureSyncMeta(projectId);

    const soql = buildParticipantSoql(
      project.project_name,
      statusFilterForProject(project.sf_project_id),
      null
    );

    let res = await conn.query(soql);
    const total = res.totalSize;
    let fetched = res.records.length;
    onProgress({ phase: "query", fetched, total });

    const records = [...res.records];
    while (!res.done) {
      res = await conn.queryMore(res.nextRecordsUrl);
      records.push(...res.records);
      fetched += res.records.length;
      onProgress({ phase: "query", fetched, total });
    }

    if (!records.length) {
      onProgress({ message: `No participants found for ${projectId}` });
      return { projectId, upserted: 0, total };
    }

    const rows = records.map((r) =>
      mapSfParticipantToPg(r, projectId, projectLocationMap, reportsToMap)
    );

    const { created, updated } = await upsertParticipantsSmart(rows);
    onProgress({
      phase: "upsert",
      processed: created + updated,
      totalRows: rows.length,
      created,
      updated,
    });

    // Watermark = max LastModifiedDate from fetched
    const maxSync = records
      .map((r) => new Date(r.LastModifiedDate))
      .reduce((a, b) => (a > b ? a : b), new Date(0));
    meta.lastSyncedAt = maxSync;
    await meta.save();

    return { projectId, upserted: created + updated, total };
  },

  async syncIncremental(conn, projectId, onProgress = () => {}) {
    const project = await Projects.findOne({
      where: { sf_project_id: projectId },
      attributes: ["sf_project_id", "project_name"],
    });
    if (!project) throw new Error(`Project ${projectId} not found in DB`);

    const { projectLocationMap, reportsToMap } = await loadReferenceMaps(conn);
    const meta = await ensureSyncMeta(projectId);
    const lastSyncedAt = meta.lastSyncedAt;

    onProgress({
      message: `Incremental sync starting for ${projectId} from ${
        lastSyncedAt ? lastSyncedAt.toISOString() : "(never)"
      }`,
    });

    const soql = buildParticipantSoql(
      project.project_name,
      statusFilterForProject(project.sf_project_id),
      lastSyncedAt
    );

    let res = await conn.query(soql);
    const total = res.totalSize;
    let fetched = res.records.length;
    onProgress({ phase: "query", fetched, total });

    const records = [...res.records];
    while (!res.done) {
      res = await conn.queryMore(res.nextRecordsUrl);
      records.push(...res.records);
      fetched += res.records.length;
      onProgress({ phase: "query", fetched, total });
    }

    if (!records.length) {
      onProgress({
        message: `No Participant__c changes for ${projectId} since ${
          lastSyncedAt ? lastSyncedAt.toISOString() : "(never)"
        }`,
      });
      return { projectId, upserted: 0, total };
    }

    const rows = records.map((r) =>
      mapSfParticipantToPg(r, projectId, projectLocationMap, reportsToMap)
    );

    const { created, updated } = await upsertParticipantsSmart(rows);
    onProgress({
      phase: "upsert",
      processed: created + updated,
      totalRows: rows.length,
      created,
      updated,
    });

    const maxSync = records
      .map((r) => new Date(r.LastModifiedDate))
      .reduce((a, b) => (a > b ? a : b), lastSyncedAt || new Date(0));
    meta.lastSyncedAt = maxSync;
    await meta.save();

    return { projectId, upserted: created + updated, total };
  },
};

export default ParticipantSyncService;
