// models/participant.model.mjs
import { DataTypes } from "sequelize";
import sequelize from "../config/db.mjs";

const Participant = sequelize.define(
  "Participant",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    // Upsert key
    salesforceId: {
      field: "salesforce_id",
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },

    // Project and identity
    projectId: { field: "project_id", type: DataTypes.STRING, allowNull: false },
    tnsId:     { field: "tns_id",     type: DataTypes.STRING, allowNull: true },

    // Names
    firstName:  { field: "first_name",  type: DataTypes.STRING },
    middleName: { field: "middle_name", type: DataTypes.STRING },
    lastName:   { field: "last_name",   type: DataTypes.STRING },

    // Demographics
    gender: DataTypes.STRING,
    age:    DataTypes.INTEGER,

    // Household / TG
    hhNumber:   { field: "hh_number",   type: DataTypes.STRING },
    ffgId:      { field: "ffg_id",      type: DataTypes.STRING },
    location:   { type: DataTypes.STRING },
    status:     { type: DataTypes.STRING },
    farmerTrainer:   { field: "farmer_trainer",   type: DataTypes.STRING },
    businessAdvisor: { field: "business_advisor", type: DataTypes.STRING },
    trainingGroup:   { field: "training_group",   type: DataTypes.STRING },
    householdId:     { field: "household_id",     type: DataTypes.STRING },

    // Flags & misc
    primaryHouseholdMember: { field: "primary_household_member", type: DataTypes.INTEGER },
    createInCommcare:       { field: "create_in_commcare",       type: DataTypes.BOOLEAN },
    otherIdNumber:          { field: "other_id_number",          type: DataTypes.STRING },
    phoneNumber:            { field: "phone_number",             type: DataTypes.STRING },

    // Farm details mirrored from SF (you asked to keep these)
    coffeeTreeNumbers: { field: "coffee_tree_numbers", type: DataTypes.INTEGER }, // Household__r.Farm_Size__c
    numberOfCoffeePlots: {
      field: "number_of_coffee_plots",
      type: DataTypes.INTEGER,
    },

    // Watermarking
    lastModifiedDate: { field: "last_modified_date", type: DataTypes.DATE },

    // <<< NEW FIELD >>>
    sendToSalesforce: {
      field: "send_to_salesforce",
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false, // default false; sync sets false explicitly
    },
  },
  {
    tableName: "participants",
    underscored: true,
  }
);

/**
 * Mark participant as needing push to Salesforce on local updates.
 * We allow sync code to bypass this by passing options.skipSendFlag = true.
 */
Participant.beforeUpdate((inst, options) => {
  if (!options || !options.skipSendFlag) {
    inst.set("sendToSalesforce", true);
  }
  // Always refresh local update timestamp
  inst.set("lastModifiedDate", new Date());
});

Participant.beforeBulkUpdate((options) => {
  if (!options || !options.skipSendFlag) {
    options.attributes = {
      ...(options.attributes || {}),
      send_to_salesforce: true,
      last_modified_date: new Date(),
    };
  } else {
    // still maintain timestamp on bulk updates even if skipping send flag
    options.attributes = {
      ...(options.attributes || {}),
      last_modified_date: new Date(),
    };
  }
});

export default Participant;
