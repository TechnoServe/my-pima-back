import express from "express";
import path from "path";
import dotenv from "dotenv";
import jsforce from "jsforce";
import { ApolloServer } from "apollo-server-express";
import { default as graphqlUploadExpress } from "graphql-upload/graphqlUploadExpress.mjs";
import LoginsTypeDefs from "./src/typeDefs/logins.typeDefs.mjs";
import LoginsResolvers from "./src/resolvers/logins.resolvers.mjs";
import ProjectsTypeDefs from "./src/typeDefs/projects.typeDefs.mjs";
import ProjectsResolvers from "./src/resolvers/projects.resolvers.mjs";
import PermissionsResolvers from "./src/resolvers/permissions.resolvers.mjs";
import PermissionsTypeDefs from "./src/typeDefs/permissions.typeDefs.mjs";
import RolesTypeDefs from "./src/typeDefs/roles.typeDefs.mjs";
import RolesResolvers from "./src/resolvers/roles.resolvers.mjs";
import usersTypeDefs from "./src/typeDefs/users.typeDefs.mjs";
import UsersResolvers from "./src/resolvers/users.resolvers.mjs";
import cron from "cron";
import cors from "cors";
import loadSFProjects from "./src/reusables/load_projects.mjs";
import Redis from "ioredis";
import { RedisPubSub } from "graphql-redis-subscriptions";
import {
  cacheTrainingGroups,
  cacheTrainingParticipants,
  cacheTrainingSessions,
} from "./src/utils/saveTrainingsCache.mjs";
import TrainingSessionsTypeDefs from "./src/typeDefs/training_sessions.typeDefs.mjs";
import TrainingSessionsResolvers from "./src/resolvers/training_sessions.resolvers.mjs";
import TrainingGroupsTypeDefs from "./src/typeDefs/training_groups.typeDefs.mjs";
import TrainingGroupsResolvers from "./src/resolvers/training_groups.resolvers.mjs";
import ProjectRoleTypeDefs from "./src/typeDefs/project_role.typeDefs.mjs";
import ProjectRoleResolvers from "./src/resolvers/project_role.resolvers.mjs";
import ParticipantsTypeDefs from "./src/typeDefs/participants.typeDefs.mjs";
import ParticipantsResolvers from "./src/resolvers/participants.resolvers.mjs";
import AttendanceTypeDefs from "./src/typeDefs/attendance.typeDefs.mjs";
import AttendanceResolvers from "./src/resolvers/attendance.resolvers.mjs";
import FarmVisitsTypeDefs from "./src/typeDefs/farm_visits.typeDefs.mjs";
import FarmVisitsResolvers from "./src/resolvers/farm_visits.resolvers.mjs";
import { getDirName } from "./src/utils/getDirName.mjs";
import FVQAsTypeDefs from "./src/typeDefs/fv_qas.typeDefs.mjs";
import FVQAsResolvers from "./src/resolvers/fv_qas.resolvers.mjs";
import TrainingModulesTypeDefs from "./src/typeDefs/training_modules.typeDefs.mjs";
import TrainingModulesResolvers from "./src/resolvers/training_modules.resolvers.mjs";
import PerformanceResolvers from "./src/resolvers/performance.resolvers.mjs";
import PerformanceTypeDefs from "./src/typeDefs/performance.typeDefs.mjs";
import { FarmVisitService } from "./src/services/farmVisit.service.mjs";
import axios from "axios";

const app = express();

app.use(cors());

app.use(express.json());

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// const redis = new Redis({
//   host: "redis-18523.c311.eu-central-1-1.ec2.redns.redis-cloud.com",
//   port: 18523,
//   password: "l7hwHCWhtn6DqDDmzZjZkk3BvnSApgmf",
//   retryStrategy: (times) => {
//     // reconnect after
//     return Math.min(times * 50, 2000);
//   },
// });

// // Set up Redis pub-sub for real-time subscriptions (optional)
// const pubSub = new RedisPubSub({
//   publisher: redis,
//   subscriber: redis,
// });

dotenv.config();

const PORT = process.env.PORT || 6500;

const creds = {
  username: process.env.SF_USERNAME,
  password: process.env.SF_PASSWORD,
  securityToken: process.env.SF_SECURITY_TOKEN,
  sf_url: process.env.SF_URL,
};

const uploadsDirectory = path.join(getDirName(import.meta.url), "uploads");

app.use("/uploads", express.static(uploadsDirectory));

app.use(graphqlUploadExpress());

var conn = new jsforce.Connection({
  // you can change loginUrl to connect to sandbox or prerelease env.
  loginUrl: creds.sf_url,
});

conn.login(
  creds.username,
  creds.password + creds.securityToken,
  function (err, userInfo) {
    if (err) {
      return console.error(err);
    }
    // Now you can get the access token and instance URL information.
    // Save them to establish a connection next time.
    console.log(conn.accessToken);
    console.log(conn.instanceUrl);
    // logged in user property
    console.log("User ID: " + userInfo.id);
    console.log("Org ID: " + userInfo.organizationId);
    console.log("Salesforce : JSForce Connection is established!");
  }
);

app.get("/api", async(req, res) => {
  await FarmVisitService.sampleFarmVisits(conn);
  res.send("Hello, My PIMA API Service!");
});

app.get('/image/:formId/:attachmentId', async (req, res) => {
  const { formId, attachmentId } = req.params;
  const commcareApiUrl = `https://www.commcarehq.org/a/tns-proof-of-concept/api/form/attachment/${formId}/${attachmentId}`;

  console.log(`requesting image on this url ${commcareApiUrl}`)
  try {
    const response = await axios.get(commcareApiUrl, {
      headers: {
        Authorization: `ApiKey ymugenga@tns.org:46fa5358cd802aabcc5c3b14a194464d40c564e6`,
      },
      responseType: 'arraybuffer', // Handle binary data (e.g., images)
    });

    // Set the appropriate headers and send the image back
    res.set('Content-Type', 'image/jpeg');
    res.send(response.data);
  } catch (error) {
    console.error('Error fetching the image:', error);
    res.status(500).send('Error fetching the image');
  }
});

const server = new ApolloServer({
  typeDefs: [
    PermissionsTypeDefs,
    RolesTypeDefs,
    usersTypeDefs,
    ProjectsTypeDefs,
    ProjectRoleTypeDefs,
    LoginsTypeDefs,
    TrainingGroupsTypeDefs,
    TrainingSessionsTypeDefs,
    ParticipantsTypeDefs,
    AttendanceTypeDefs,
    FarmVisitsTypeDefs,
    FVQAsTypeDefs,
    TrainingModulesTypeDefs,
    PerformanceTypeDefs
  ],
  resolvers: [
    PermissionsResolvers,
    RolesResolvers,
    UsersResolvers,
    ProjectsResolvers,
    ProjectRoleResolvers,
    LoginsResolvers,
    TrainingGroupsResolvers,
    TrainingSessionsResolvers,
    ParticipantsResolvers,
    AttendanceResolvers,
    FarmVisitsResolvers,
    FVQAsResolvers,
    TrainingModulesResolvers,
    PerformanceResolvers
  ],
  subscriptions: { path: "/subscriptions", onConnect: () => pubSub },
  csrfPrevention: true,
  cache: "bounded",
  context: ({ req }) => {
    return {
      sf_conn: conn,
    };
  },
  introspection: true,
  playground: true,
});

server
  .start()
  .then(() => {
    server.applyMiddleware({ app });

    // Define a cron job to fetch data from the remote database and update the local database
    // const fetchDataJob = new cron.CronJob("0 0 */24 * * *", async () => {
    //   // await loadSFProjects(conn);
    //   pubSub.publish("dataUpdated", { dataUpdated: true });
    // });

    // Start the cron job
    // fetchDataJob.start();

    app.listen({ port: PORT }, () => {
      console.log(
        `🚀 Server ready at http://localhost:${PORT}${server.graphqlPath}`
      );
    });
  })
  .catch(function (error) {
    console.log(error);
  });
