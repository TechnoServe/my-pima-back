import ExcelJS from "exceljs";
import fetchImage from "../utils/commCareApi.mjs";

export const ReportGeneratorService = {
  async generateFarmVisitExcelReport(trainerStats) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Farm Visit Report");

    // Define the base columns for the report
    const baseColumns = [
      { header: "Farmer Trainer", key: "farmer_trainer", width: 30 },
      { header: "Total Sampled Records", key: "total_sampled", width: 20 },
    ];

    // Dynamically determine best practice types from the first entry
    const bestPracticeTypes = Object.keys(trainerStats[0].bestPracticeStats);

    // Add dynamic columns for each best practice
    bestPracticeTypes.forEach((practice) => {
      baseColumns.push({
        header: `${practice} - Yes (%)`,
        key: `${practice}_yes`,
        width: 15,
      });
      baseColumns.push({
        header: `${practice} - No (%)`,
        key: `${practice}_no`,
        width: 15,
      });
      baseColumns.push({
        header: `${practice} - Unclear (%)`,
        key: `${practice}_unclear`,
        width: 15,
      });
      baseColumns.push({
        header: `${practice} - Not Reviewed (%)`,
        key: `${practice}_not_reviewed`,
        width: 20,
      });
    });

    worksheet.columns = baseColumns;

    // Add data for each farmer trainer
    trainerStats.forEach((trainerStat) => {
      const rowData = {
        farmer_trainer: trainerStat.farmer_trainer,
        total_sampled: trainerStat.totalSampled,
      };

      // Add the best practice percentages for each type
      bestPracticeTypes.forEach((practice) => {
        rowData[`${practice}_yes`] =
          trainerStat.bestPracticeStats[practice].yesPercentage + "%";
        rowData[`${practice}_no`] =
          trainerStat.bestPracticeStats[practice].noPercentage + "%";
        rowData[`${practice}_unclear`] =
          trainerStat.bestPracticeStats[practice].unclearPercentage + "%";
        rowData[`${practice}_not_reviewed`] =
          trainerStat.bestPracticeStats[practice].notReviewedPercentage + "%";
      });

      worksheet.addRow(rowData);
    });

    // Write the Excel file to a buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Convert the buffer to Base64
    return buffer.toString("base64");
  },

  generateSampledTSReport: async (sampledRecords) => {
    // Create a new workbook
    const workbook = new ExcelJS.Workbook();

    // **Tab 1: Status Breakdown**
    const sheet1 = workbook.addWorksheet("Status Breakdown");

    // Define headers
    sheet1.columns = [
      { header: "Farmer Trainer", key: "trainer", width: 20 },
      { header: "Correct", key: "approved", width: 15 },
      { header: "Incorrect", key: "invalid", width: 15 },
      { header: "Unclear", key: "unclear", width: 15 },
      { header: "Pending", key: "pending", width: 15 },
    ];

    // Aggregate the data
    const breakdownData = sampledRecords.reduce((acc, session) => {
      const trainer = session.farmer_trainer_name;
      const status = session.image_review_result || "pending";

      if (!acc[trainer]) {
        acc[trainer] = { approved: 0, unclear: 0, invalid: 0, pending: 0 };
      }

      acc[trainer][status]++;
      return acc;
    }, {});

    // Add rows to the sheet
    Object.entries(breakdownData).forEach(([trainer, counts]) => {
      sheet1.addRow([
        trainer,
        counts.approved,
        counts.invalid,
        counts.unclear,
        counts.pending,
      ]);
    });

    // **Tab 2: Approved Sessions**
    const sheet2 = workbook.addWorksheet("Approved Sessions");
    sheet2.columns = [
      { header: "Training Module", key: "training_module", width: 20 },
      { header: "Trainer", key: "trainer", width: 20 },
      { header: "Attendance", key: "attendance", width: 15 },
      { header: "Male Attendance", key: "male_attendance", width: 15 },
      { header: "Female Attendance", key: "female_attendance", width: 15 },
      { header: "Group", key: "group", width: 20 },
      { header: "Date", key: "date", width: 20 },
      { header: "Status", key: "status", width: 15 },
      { header: "Image", key: "image", width: 30 },
    ];

    // **Process records asynchronously**
    const promises = sampledRecords.map(async (session) => {
      // Fetch image asynchronously if URL exists
      let base64Image = null;
      if (session.session_image_url) {
        base64Image = await fetchImage(session.session_image_url);
      }

      let status = "";
      if (session.image_review_result === "approved") {
        status = "Correct";
      } else if (session.image_review_result === "invalid") {
        status = "Incorrect";
      } else if (session.image_review_result === "unclear") {
        status = "Unclear";
      } else {
        status = "pending";
      }

      // Add session data to a new row
      const row = sheet2.addRow({
        training_module: session.training_module_name,
        trainer: session.farmer_trainer_name,
        attendance: session.total_attendance,
        male_attendance: session.male_attendance,
        female_attendance: session.female_attendance,
        group: session.tg_name,
        date: session.session_date
          ? new Date(session.session_date).toLocaleDateString()
          : "",
        status: status,
      });

      // Embed the image in the Excel sheet if available
      if (base64Image) {
        const imageId = workbook.addImage({
          base64: base64Image.split(",")[1],
          extension: "png",
        });

        // Calculate the row index for the image (offset needed because ExcelJS uses 0-based index for images)
        const rowIndex = row.number;

        // Place the image next to the corresponding row
        sheet2.addImage(imageId, {
          tl: { col: 8, row: rowIndex - 1 }, // Adjust positioning based on row
          ext: { width: 200, height: 200 }, // Size of the image
        });

        // Adjust the row height to accommodate the image
        sheet2.getRow(rowIndex).height = 200; // Adjust height as needed
      }
    });

    // Wait for all the promises to resolve
    await Promise.all(promises);

    // Convert the workbook to a base64 string
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer.toString("base64");
  },
};
