import ExcelJS from "exceljs";

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
      baseColumns.push({ header: `${practice} - Yes (%)`, key: `${practice}_yes`, width: 15 });
      // baseColumns.push({ header: `${practice} - No (%)`, key: `${practice}_no`, width: 15 });
      // baseColumns.push({ header: `${practice} - Unclear (%)`, key: `${practice}_unclear`, width: 15 });
      // baseColumns.push({ header: `${practice} - Not Reviewed (%)`, key: `${practice}_not_reviewed`, width: 20 });
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
        rowData[`${practice}_yes`] = trainerStat.bestPracticeStats[practice].yesPercentage + "%";
        // rowData[`${practice}_no`] = trainerStat.bestPracticeStats[practice].noPercentage + "%";
        // rowData[`${practice}_unclear`] = trainerStat.bestPracticeStats[practice].unclearPercentage + "%";
        // rowData[`${practice}_not_reviewed`] = trainerStat.bestPracticeStats[practice].notReviewedPercentage + "%";
      });

      worksheet.addRow(rowData);
    });

    // Write the Excel file to a buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Convert the buffer to Base64
    return buffer.toString("base64");
  },
};
