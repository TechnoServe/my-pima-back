// Service to fetch Check__c and Attendance__c, compute comparisons per Participant__c
// Assumes a jsforce Connection `conn` is passed in

const PREV = "Previous";
const EVIDENCE_LIMIT = 20;

// Adjust these field names if your org uses different API names
const FIELDS = {
  // Check__c
  CHECK: [
    "Id",
    "Participant__c",
    "Farm_Visit__c",
    "Observation__c",
    "Training_Session__r.Training_Module__r.Module_Number__c",
    "Number_of_Trainings_Attended__c",
    "Attended_Any_Trainings__c",
    "Attended_Last_Months_Training__c",
    "Participant__r.Name",
    "Participant__r.Last_Name__c",
    "Participant__r.TNS_Id__c",
    "Participant__r.Training_Group__r.Name",
    "Participant__r.Project__c",
    "Participant__r.Training_Group__c",
    "Participant__r.Training_Group__r.Project__c",
  ],

  // Attendance__c
  ATTENDANCE: [
    "Id",
    "Participant__c",
    "Attended__c",
    "Training_Session__r.Date__c",
    "Training_Session__r.Training_Module__r.Module_Title__c",
    "Training_Session__r.Training_Module__r.Current_Previous_Module__c",
    "Training_Session__r.Training_Module__r.Module_Number__c",
  ],
};

function normBool(v) {
  if (v === true || v === false) return v;
  if (v == null) return null;
  const s = String(v).toLowerCase();
  if (s === "true" || s === "yes" || s === "1") return true;
  if (s === "false" || s === "no" || s === "0") return false;
  return null;
}

function chunk(arr, size = 800) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function soqlIn(ids) {
  return ids.map((id) => `'${id}'`).join(",");
}

export async function getAttendanceCheckComparison(conn, args) {
  const { projectId, search = "", tgIds } = args;

  // 1) Latest Check__c per Participant for the project
  let where = `Participant__r.Training_Group__r.Project__c = '${projectId}'`;

  if (search?.trim()) {
    const s = search.trim().replace(/'/g, "\\'");
    where += ` AND (
      Participant__r.Name LIKE '%${s}%'
      OR Participant__r.Last_Name__c LIKE '%${s}%'
      OR Participant__r.TNS_Id__c LIKE '%${s}%'
    )`;
  }

  if (tgIds?.length) {
    where += ` AND Participant__r.Training_Group__c IN (${soqlIn(tgIds)})`;
  }

  const checkSoql = `
    SELECT ${FIELDS.CHECK.join(",")}
    FROM Check__c
    WHERE ${where}
    ORDER BY Participant__c, CreatedDate DESC
  `;

  const checkRows = await queryAll(conn, checkSoql);

  // De-dupe to the most recent Check per participant
  const latestByParticipant = new Map();
  for (const row of checkRows) {
    const pid = row.Participant__c;
    if (!pid) continue;
    if (!latestByParticipant.has(pid)) latestByParticipant.set(pid, row);
  }

  const participantIds = Array.from(latestByParticipant.keys());
  if (participantIds.length === 0) return [];

  // 2) Attendance__c for these participants (all rows; we'll filter in code)
  const attendanceMap = new Map(); // pid -> rows
  for (const group of chunk(participantIds, 800)) {
    const attSoql = `
      SELECT ${FIELDS.ATTENDANCE.join(",")}
      FROM Attendance__c
      WHERE Participant__c IN (${soqlIn(group)})
    `;
    const attRows = await queryAll(conn, attSoql);
    for (const r of attRows) {
      const pid = r.Participant__c;
      if (!attendanceMap.has(pid)) attendanceMap.set(pid, []);
      attendanceMap.get(pid).push(r);
    }
  }

  // 3) Compute comparisons per participant
  const items = [];
  for (const [pid, chk] of latestByParticipant.entries()) {
    const all = attendanceMap.get(pid) || [];
    const attended = all.filter((a) => a?.Attended__c === 1);

    const countAttended = attended.length;
    const anyAttended = countAttended > 0;

    // NEW: previous-module logic based on module number at the time of Check
    const chkModuleNum = Number(
      chk?.Training_Session__r?.Training_Module__r?.Module_Number__c
    );
    let attendedPreviousModule = false;
    if (Number.isFinite(chkModuleNum)) {
      const prevModuleNum = chkModuleNum - 1;
      if (prevModuleNum >= 1) {
        attendedPreviousModule = attended.some((a) => {
          const m = Number(
            a?.Training_Session__r?.Training_Module__r?.Module_Number__c
          );
          return Number.isFinite(m) && m === prevModuleNum;
        });
      } else {
        attendedPreviousModule = false;
      }
    } else {
      // If we don't know the module number on the check, treat as false
      attendedPreviousModule = false;
    }

    // Evidence: show BOTH attended and absent (limited)
    const evidence = all.slice(0, EVIDENCE_LIMIT).map((a) => ({
      attendanceId: a.Id,
      trainingDate: a?.Training_Session__r?.Date__c || null,
      moduleName:
        a?.Training_Session__r?.Training_Module__r?.Module_Title__c || null,
      currentPreviousModule:
        a?.Training_Session__r?.Training_Module__r?.Current_Previous_Module__c ||
        null,
      attended: !!a.Attended__c,
    }));

    // Normalize Check values
    const chkCount = Number(chk.Number_of_Trainings_Attended__c ?? 0);
    const chkAny = normBool(chk.Attended_Any_Trainings__c);
    const chkPrev = normBool(chk.Attended_Last_Months_Training__c);

    // NEW: presence flags derived from Id existence (returned on check)
    const hasFarmVisit = !!chk.Farm_Visit__c;
    const hasObservation = !!chk.Observation__c;

    // NEW: matching rules
    let matches;
    if (hasFarmVisit) {
      // Compare only any & previous; do not include countEqual here
      matches = {
        anyEqual: chkAny === anyAttended,
        previousModuleEqual: chkPrev === attendedPreviousModule,
      };
    } else if (hasObservation && !hasFarmVisit) {
      // Compare only previous
      matches = {
        previousModuleEqual: chkPrev === attendedPreviousModule,
      };
    } else {
      // Neither present: compare all three
      matches = {
        countEqual: chkCount === countAttended,
        anyEqual: chkAny === anyAttended,
        previousModuleEqual: chkPrev === attendedPreviousModule,
      };
    }

    items.push({
      participantId: pid,
      tnsId: chk?.Participant__r?.TNS_Id__c || null,
      firstName: chk?.Participant__r?.Name || null,
      lastName: chk?.Participant__r?.Last_Name__c || null,
      trainingGroupName: chk?.Participant__r?.Training_Group__r?.Name || null,
      check: {
        recordId: chk.Id,
        numberOfTrainingsAttended: chkCount,
        attendedAnyTrainings: chkAny,
        attendedLastMonthsTraining: chkPrev,
        observation: hasObservation, // boolean as requested
        farmVisit: hasFarmVisit,     // boolean as requested
      },
      attendance: {
        countAttended,
        anyAttended,
        attendedPreviousModule,
        evidence,
      },
      matches,
    });
  }

  return items;
}

// Helper to exhaust a SOQL query (handles pagination)
async function queryAll(conn, soql) {
  const res = await conn.query(soql);
  let records = res.records || [];
  let done = res.done;
  let next = res.nextRecordsUrl;
  while (!done && next) {
    const more = await conn.queryMore(next);
    records = records.concat(more.records || []);
    done = more.done;
    next = more.nextRecordsUrl;
  }
  return records;
}
