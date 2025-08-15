// services/stagedUpload.service.mjs
import ExcelJS from "exceljs";
import Projects from "../models/projects.models.mjs";
import Participant from "../models/participant.model.mjs";
import Attendance from "../models/attendance.model.mjs";
import ParticipantOutbox from "../models/participantOutbox.model.mjs";
import HouseholdOutbox from "../models/householdOutbox.model.mjs";
import AttendanceOutbox from "../models/attendanceOutbox.model.mjs";
import UploadRun from "../models/uploadRun.model.mjs";

// ---------- helpers (compact versions that mirror your existing logic) ----------
const HEADER_MAP = {
  hh_number: "Household_Number__c",
  first_name: "Name",
  middle_name: "Middle_Name__c",
  last_name: "Last_Name__c",
  sf_household_id: "Household__c",
  farmer_number: "Primary_Household_Member__c",
  tns_id: "TNS_Id__c",
  gender: "Gender__c",
  age: "Age__c",
  phone_number: "Phone_Number__c",
  coffee_tree_numbers: "Farm_Size__c",
  ffg_id: "ffg_id",
  status: "Status__c",
  farmer_sf_id: "Participant__c",
  national_identification_id: "Other_ID_Number__c",
  coop_membership_number: "Other_ID_Number__c",
  growers_number: "Other_ID_Number__c",
  number_of_coffee_plots: "Number_of_Coffee_Plots__c",
};

function csvToRows(buffer) {
  const rows = buffer.toString().split("\n").filter(Boolean);
  const header = rows[0]
    .split(",")
    .map((v) => (HEADER_MAP[v] || v).replace(/[\r"]/g, "").trim());
  const body = rows
    .slice(1)
    .map((r) => r.split(",").map((v) => v.replace(/[\r"]/g, "").trim()));
  return { header, rows: body };
}

function pad2(n) {
  const i = parseInt(n, 10);
  if (Number.isNaN(i)) return "";
  return String(i).padStart(2, "0");
}

function hhComposite(ffg_id, hhNum) {
  // matches your “Household_ID__c = ffg_id + Name(2-digit)”
  return `${ffg_id}${pad2(hhNum)}`;
}

async function errorExcelBase64(errors) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Errors");
  ws.columns = [
    { header: "Row", key: "row", width: 8 },
    { header: "Message", key: "msg", width: 120 },
  ];
  errors.forEach((e) => ws.addRow(e));
  const buf = await wb.xlsx.writeBuffer();
  return buf.toString("base64");
}

// mirror of your household grouping & validations
function formatHouseholds(header, rows) {
  const idx = (name) => header.indexOf(name);
  const I = {
    hh: idx("Household_Number__c"),
    ffg: idx("ffg_id"),
    primary: idx("Primary_Household_Member__c"),
    status: idx("Status__c"),
    hhId: idx("Household__c"),
    farm: idx("Farm_Size__c"),
    plots: idx("Number_of_Coffee_Plots__c"),
  };

  const items = rows.map((r) => ({
    ffg_id: r[I.ffg],
    Household_Number__c: r[I.hh] ? parseInt(r[I.hh], 10) : null,
    Primary_Household_Member__c:
      r[I.primary] === "1" ? "Yes" : r[I.primary] === "2" ? "No" : r[I.primary],
    Status__c: r[I.status] || "Active",
    Household__c: r[I.hhId] || "",
    Farm_Size__c:
      r[I.farm] && r[I.farm] !== "null" ? parseInt(r[I.farm], 10) : null,
    Number_of_Coffee_Plots__c:
      r[I.plots] && r[I.plots] !== "null" ? parseInt(r[I.plots], 10) : null,
  }));

  // filter inactive
  const active = items.filter(
    (x) => (x.Status__c || "").toLowerCase() === "active"
  );

  // group ffg + hh
  const groups = new Map();
  for (const row of active) {
    if (row.Household_Number__c == null) continue;
    const key = `${row.ffg_id}-${row.Household_Number__c}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const errors = [];
  const households = [];

  for (const [key, members] of groups) {
    const primary = members.find(
      (m) => m.Primary_Household_Member__c === "Yes"
    );
    const secondary = members.find(
      (m) => m.Primary_Household_Member__c === "No"
    );
    if (members.length > 2) {
      errors.push({
        row: "-",
        msg: `Household ${key} has more than 2 members`,
      });
      continue;
    }
    if (!primary && !secondary) {
      errors.push({ row: "-", msg: `Household ${key} has no active members` });
      continue;
    }
    if (members.length === 2 && !secondary) {
      errors.push({
        row: "-",
        msg: `Household ${key} has 2 active rows but no secondary`,
      });
      continue;
    }

    const m = primary || secondary; // carry core fields from any row
    households.push({
      ffg_id: m.ffg_id,
      Household_Number__c: m.Household_Number__c,
      Household__c: m.Household__c || null, // existing SF Id if any
      Name: pad2(m.Household_Number__c),
      Household_ID__c: hhComposite(m.ffg_id, m.Household_Number__c),
      Number_of_Members__c: members.length,
      Farm_Size__c: m.Farm_Size__c,
      Number_of_Coffee_Plots__c: m.Number_of_Coffee_Plots__c,
    });
  }

  return { households, errors };
}

function mapParticipants(header, rows, tgByFfgId) {
  const idx = (name) => header.indexOf(name);
  const I = {
    name: idx("Name"),
    mid: idx("Middle_Name__c"),
    last: idx("Last_Name__c"),
    gender: idx("Gender__c"),
    age: idx("Age__c"),
    phone: idx("Phone_Number__c"),
    primary: idx("Primary_Household_Member__c"),
    tns: idx("TNS_Id__c"),
    ffg: idx("ffg_id"),
    hhnum: idx("Household_Number__c"),
    hh: idx("Household__c"),
    status: idx("Status__c"),
    partId: idx("Participant__c"),
    otherId: idx("Other_ID_Number__c"),
    nPlots: idx("Number_of_Coffee_Plots__c"),
  };

  const parts = rows.map((r) => {
    const ffg_id = r[I.ffg];
    const tgId = tgByFfgId.get(ffg_id) || null;
    const hhNumber = r[I.hhnum] ? parseInt(r[I.hhnum], 10) : null;
    const primaryHouseholdMember =
      r[I.primary] === "1" ? 1 : r[I.primary] === "2" ? 2 : null;

    return {
      salesforceId: r[I.partId] || null,
      tnsId: `${ffg_id}${pad2(hhNumber)}${r[I.primary] || ""}`, // mirrors your previous logic
      firstName: r[I.name] || "",
      middleName: r[I.mid] || "",
      lastName: r[I.last] || "",
      gender: r[I.gender] || "",
      age: r[I.age] ? parseInt(r[I.age], 10) : null,
      phoneNumber: r[I.phone] || null,
      primaryHouseholdMember,
      ffgId: ffg_id,
      trainingGroup: tgId,
      householdId: r[I.hh] || null, // may be null for “new” HH create
      hhNumber: r[I.hhnum] || null,
      status: r[I.status] || "Active",
      otherIdNumber: r[I.otherId] || null,
      numberOfCoffeePlots:
        r[I.nPlots] && r[I.nPlots] !== "null"
          ? parseInt(r[I.nPlots], 10)
          : null,
    };
  });

  return parts;
}

function norm(v) {
  return v === null || v === undefined || v === "" ? "" : String(v).trim();
}
function numeq(a, b) {
  if (a == null && b == null) return true;
  const an = Number(a),
    bn = Number(b);
  return Number.isNaN(an) && Number.isNaN(bn) ? true : an === bn;
}

/** Compare CSV → PG (return true when there is NO change) */
function participantNoChangePG(pg, csv) {
  return (
    norm(pg.firstName) === norm(csv.firstName) &&
    norm(pg.middleName) === norm(csv.middleName) &&
    norm(pg.lastName) === norm(csv.lastName) &&
    norm(pg.gender) === norm(csv.gender) &&
    numeq(pg.age, csv.age) &&
    norm(pg.phoneNumber) === norm(csv.phoneNumber) &&
    Number(pg.primaryHouseholdMember || 0) ===
      Number(csv.primaryHouseholdMember || 0) &&
    norm(pg.tnsId) === norm(csv.tnsId) &&
    norm(pg.trainingGroup) === norm(csv.trainingGroup) &&
    norm(pg.householdId) === norm(csv.householdId) &&
    norm(pg.status) === norm(csv.status) &&
    norm(pg.otherIdNumber) === norm(csv.otherIdNumber) &&
    numeq(pg.numberOfCoffeePlots, csv.numberOfCoffeePlots)
  );
}

function isSfId(s) {
  return /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(String(s || "").trim());
}
function extractModuleId(raw) {
  const s = String(raw || "").trim();
  const last = s.split("-").pop().trim();
  // strip any non-alnum just in case
  const candidate = last.replace(/[^a-zA-Z0-9]/g, "");
  return isSfId(candidate) ? candidate : s;
}

function attendanceFromCsv(header, rows) {
  // Use your compact rule: [12]=farmer_sf_id, [17]=ffg_id, from col 23 onward are modules
  const farmerIdx = header.indexOf("farmer_sf_id");
  const ffgIdx = header.indexOf("ffg_id");
  const moduleHeaders = header.slice(23); // after farmer + ffg
  const records = [];

  rows.forEach((r) => {
    const farmerSF = r[farmerIdx];
    const ffgId = r[ffgIdx];
    for (let i = 23; i < r.length; i++) {
      const moduleId = extractModuleId(header[i]);
      if (!isSfId(moduleId)) {
        throw new Error(`Invalid module ID '${moduleId}'`);
      }
      const val = r[i];
      if (val === "" || val == null) continue;
      if (!["0", "1"].includes(val))
        throw new Error(`Invalid attendance value '${val}'`);
      records.push({
        participantSalesforceId: farmerSF || null,
        ffgId,
        moduleId,
        attended: val === "1",
      });
    }
  });

  return { moduleHeaders, records };
}

// --------------------------------------------------------------------------------

export const StagedUploadService = {
  /**
   * Full staged ingest for the pilot project:
   * - validate HH groups
   * - stage household upserts (outbox)
   * - upsert participants into PG + stage participant outbox
   * - upsert attendance into PG + stage attendance outbox (changed only)
   */
  async ingestCsvBufferForPilot(buffer, projectId, sf_conn, sourceFile) {
    const project = await Projects.findOne({
      where: { sf_project_id: projectId },
    });
    if (!project) return { status: 404, message: "Project not found." };

    // check if project has active run

    const activeRun = await UploadRun.findOne({
      where: { projectId, status: "running" },
    });

    if (activeRun) {
      return {
        status: 409,
        message: "An upload is already in progress for this project.",
      };
    }

    // 1) Parse CSV
    const { header, rows } = csvToRows(buffer);

    // 2) Build HH blocks (validations identical to your previous ones)
    const { households, errors } = formatHouseholds(header, rows);
    if (errors.length) {
      return {
        status: 400,
        message: "Validation errors found.",
        file: await errorExcelBase64(errors),
      };
    }

    // After formatting households then create the upload run
    const run = await UploadRun.create({
      projectId,
      status: "running",
      meta: { source: "participants-upload" },
      fileUrl: sourceFile.fileUrl || null,
      fileName: sourceFile.fileName || null,
      fileBytes: sourceFile.fileBytes || null,
      mimeType: sourceFile.mimeType || "text/csv",
    });

    // 3) Resolve Training Group Ids for ffg_id set
    const ffgSet = [...new Set(households.map((h) => h.ffg_id))];
    const tgLookup = await sf_conn.query(
      `SELECT Id, TNS_Id__c FROM Training_Group__c WHERE TNS_Id__c IN (${ffgSet
        .map((x) => `'${x}'`)
        .join(",")})`
    );
    const tgByFfgId = new Map(tgLookup.records.map((r) => [r.TNS_Id__c, r.Id]));

    // 4) Stage Household upserts (avoid staging unchanged updates if we have Id)
    const existingIds = households.map((h) => h.Household__c).filter(Boolean);
    const existingMap = new Map();
    if (existingIds.length) {
      for (let i = 0; i < existingIds.length; i += 500) {
        const batch = existingIds.slice(i, i + 500);
        const res = await sf_conn.query(
          `SELECT Id, Name, Training_Group__c, Number_of_Members__c, Farm_Size__c, Number_of_Coffee_Plots__c, Household_ID__c
           FROM Household__c WHERE Id IN ('${batch.join("','")}')`
        );
        res.records.forEach((r) => existingMap.set(r.Id, r));
      }
    }

    const hhPayloads = households
      .filter((h) => {
        if (!h.Household__c) return true; // new create by composite
        const sf = existingMap.get(h.Household__c);
        if (!sf) return true;
        // same compare as didHouseholdValuesChange
        const farm = h.Farm_Size__c ?? null;
        const plots = h.Number_of_Coffee_Plots__c ?? null;
        return !(
          (sf.Farm_Size__c ?? null) === farm &&
          (sf.Number_of_Coffee_Plots__c ?? null) === plots &&
          (sf.Number_of_Members__c ?? null) === h.Number_of_Members__c &&
          (sf.Name ?? null) === h.Name &&
          (sf.Training_Group__c ?? null) ===
            (tgByFfgId.get(h.ffg_id) || null) &&
          (sf.Household_ID__c ?? null) === h.Household_ID__c
        );
      })
      .map((h) => {
        const payload = {
          ...(h.Household__c ? { Id: h.Household__c } : {}),
          Name: h.Name,
          Household_Number__c: h.Household_Number__c,
          Training_Group__c: tgByFfgId.get(h.ffg_id) || null,
          Number_of_Members__c: h.Number_of_Members__c,
          Farm_Size__c: h.Farm_Size__c ?? null,
          Number_of_Coffee_Plots__c: h.Number_of_Coffee_Plots__c ?? null,
          Household_ID__c: h.Household_ID__c,
        };

        return {
          projectId,
          salesforceId: h.Household__c || null,
          ffgId: h.ffg_id,
          householdNumber: h.Household_Number__c,
          householdComposite: h.Household_ID__c,
          trainingGroupId: tgByFfgId.get(h.ffg_id) || null,
          payload,
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(),
          uploadRunId: run.id,
        };
      });

    if (hhPayloads.length) {
      // ensure idempotency: avoid duplicate pending same composite
      for (const job of hhPayloads) {
        const exists = await HouseholdOutbox.findOne({
          where: {
            householdComposite: job.householdComposite,
            status: "pending",
          },
        });
        if (!exists) await HouseholdOutbox.create(job);
      }
    }

    // 5) Build participants
    const participantsParsed = mapParticipants(header, rows, tgByFfgId);

    let stagedParticipants = 0;
    for (const p of participantsParsed) {
      // Hard rule: participants must have a Salesforce Id (we never create in SF)
      if (!p.salesforceId) {
        // Optionally collect a warning, but do not stage
        continue;
      }

      // Optional: de-dupe reused TNS ids (inactive old owner) to avoid unique constraint
      // if (p.tnsId) {
      //   const dupe = await Participant.findOne({
      //     where: { projectId, tnsId: p.tnsId },
      //     raw: true,
      //   });
      //   if (dupe && dupe.salesforceId !== p.salesforceId) {
      //     // only free the old owner’s tnsId; do not stage anything for them
      //     await Participant.update({ tnsId: null }, { where: { id: dupe.id } });
      //   }
      // }

      // Load PG snapshot by Salesforce Id
      const existing = await Participant.findOne({
        where: { projectId, salesforceId: p.salesforceId },
      });

      if (!existing) {
        // First time we see this participant in PG → insert for local consistency,
        // but DO NOT stage an outbox job (record is already on SF).
        await Participant.create({
          ...p,
          projectId,
          location: "N/A",
          coffeeTreeNumbers: null,
          sendToSalesforce: false,
          lastModifiedDate: new Date(),
        });
        continue;
      }

      // Compare CSV vs PG; stage only when changed
      const noChange = participantNoChangePG(existing.get({ plain: true }), p);

      if (noChange) {
        // Ensure we don’t accidentally keep a send flag around
        if (existing.sendToSalesforce) {
          await existing.update({ sendToSalesforce: false });
        }
        continue; // nothing to stage
      }

      // PG update (reflect CSV) and flip the local send flag
      await existing.update({
        ...p,
        projectId,
        sendToSalesforce: true,
        lastModifiedDate: new Date(),
      });

      // Stage to ParticipantOutbox (UPDATE-only — Id is mandatory)
      const hhComp = hhComposite(p.ffgId, p.hhNumber);
      const payload = {
        Id: existing.salesforceId, // force UPDATE path
        Name: p.firstName || null,
        Middle_Name__c: p.middleName || null,
        Last_Name__c: p.lastName || null,
        Gender__c: p.gender || null,
        Age__c: p.age ?? null,
        Phone_Number__c: p.phoneNumber || null,
        Primary_Household_Member__c:
          p.primaryHouseholdMember === 1
            ? "Yes"
            : p.primaryHouseholdMember === 2
            ? "No"
            : null,
        TNS_Id__c: p.tnsId || null,
        Training_Group__c: p.trainingGroup || null, // may be null; resolver can fill by ffgId
        Household__c: p.householdId || null, // may be null; resolver can fill by composite
        Status__c: p.status || "Active",
        Other_ID_Number__c: p.otherIdNumber || null,
        Number_of_Coffee_Plots__c: p.numberOfCoffeePlots ?? null,
        Resend_to_OpenFN__c: true,
        Create_In_CommCare__c: false,
        Check_Status__c: true,
        __resolverHints: {
          ffgId: p.ffgId,
          householdComposite: hhComp,
        },
      };

      const existsPending = await ParticipantOutbox.findOne({
        where: { participantId: existing.id, status: "pending" },
      });
      if (!existsPending) {
        await ParticipantOutbox.create({
          participantId: existing.id,
          projectId,
          payload,
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(),
          uploadRunId: run.id,
        });
      }
      stagedParticipants++;
    }

    // 6) Attendance changes → upsert PG + stage attendance outbox (change-only)

    const aHeader = ["farmer_sf_id", "ffg_id", ...header.slice(2)];
    const aRows = rows.map((r) => [
      r[header.indexOf("farmer_sf_id")],
      r[header.indexOf("ffg_id")],
      ...r.slice(2),
    ]);
    const { records: attRows } = attendanceFromCsv(aHeader, aRows);

    // Use ONLY Salesforce Ids for lookups/keys
    const moduleIds = [...new Set(attRows.map((x) => x.moduleId))];
    const participantSfIds = [
      ...new Set(attRows.map((x) => x.participantSalesforceId).filter(Boolean)),
    ];

    // FIX: use Op.in for array filters
    const existing =
      participantSfIds.length && moduleIds.length
        ? await Attendance.findAll({
            where: {
              moduleId: { [Op.in]: moduleIds },
              participantId: { [Op.in]: participantSfIds }, // Attendance.participantId stores SF Id
            },
          })
        : [];

    const mapExisting = new Map();
    existing.forEach((e) => {
      mapExisting.set(`${e.participantId}::${e.moduleId}`, e);
    });

    // helpers
    const asBool = (v) => {
      if (typeof v === "boolean") return v;
      if (v === 1 || v === "1") return true;
      if (v === 0 || v === "0") return false;
      return !!v;
    };

    // avoid dup staging within the same ingest
    const stagedKeys = new Set();

    let stagedAttendance = 0;

    for (const rec of attRows) {
      const sfId = rec.participantSalesforceId;
      if (!sfId) continue; // we require SF Id to reliably compare

      const key = `${sfId}::${rec.moduleId}`;
      if (stagedKeys.has(key)) continue; // de-dupe same row if present multiple times

      const prior = mapExisting.get(key);
      const newVal = asBool(rec.attended);
      const oldVal = prior != null ? asBool(prior.attended) : null;

      // If record exists AND value didn't change → skip
      if (prior && oldVal === newVal) {
        // ensure no stray send flag
        if (prior.sendToSalesforce) {
          await prior.update({ sendToSalesforce: false });
        }
        continue;
      }

      // Upsert PG
      if (prior && oldVal !== newVal) {
        await prior.update({ attended: newVal, sendToSalesforce: true });
        await Attendance.create({
          salesforceId: null,
          projectId,
          participantId: sfId, // store SF Id consistently
          attended: newVal,
          trainingSessionId: null,
          date: null,
          moduleId: rec.moduleId,
          sendToSalesforce: true,
        });
      } else if (!prior) {
        await Attendance.create({
          salesforceId: null,
          projectId,
          participantId: sfId, // store SF Id consistently
          attended: newVal,
          trainingSessionId: null,
          date: null,
          moduleId: rec.moduleId,
          sendToSalesforce: true,
        });
      }

      // De-dupe pending outbox: don't enqueue if a matching pending exists
      const pendingExists = await AttendanceOutbox.findOne({
        where: {
          projectId,
          participantSalesforceId: sfId,
          moduleId: rec.moduleId,
          status: "pending",
        },
      });
      if (pendingExists) {
        stagedKeys.add(key);
        continue;
      }

      await AttendanceOutbox.create({
        projectId,
        participantSalesforceId: sfId,
        participantTnsId: null, // we’re keying by SF Id; resolver can ignore this
        ffgId: rec.ffgId,
        moduleId: rec.moduleId,
        attended: newVal,
        payload: {
          Status__c: newVal ? "Present" : "Absent",
          __resolverHints: { ffgId: rec.ffgId, moduleId: rec.moduleId },
        },
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
        uploadRunId: run.id,
      });

      stagedKeys.add(key);
      stagedAttendance++;
    }

    return {
      status: 200,
      message: `Staged: ${hhPayloads.length} household(s), ${stagedParticipants} participant(s), ${stagedAttendance} attendance record(s).`,
    };
  },
};
