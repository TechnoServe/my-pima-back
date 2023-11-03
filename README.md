# my-pima-api

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/TechnoServe/my-pima-back/blob/main/LICENSE)

## Overview

The API to serve TechnoServe Coffee Program web app called "My PIMA"

## Table of Contents

- [my-pima-api](#my-pima-api)
  - [Overview](#overview)
  - [Table of Contents](#table-of-contents)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
    - [**How to migrate postgres db**](#how-to-migrate-postgres-db)
  - [Usage](#usage)
  - [API Documentation](#api-documentation)
  - [Run pre-required endpoints](#run-pre-required-endpoints)

## Getting Started

Explain how to get your GraphQL API project up and running. Include instructions on prerequisites, installation, and configuration.

### Prerequisites

1. Install [Node.js](https://nodejs.org/en/download/)
2. Install [PostgreSQL](https://www.postgresql.org/download/)

### Installation

Provide step-by-step installation instructions. For example:

1. Clone this repository: `git clone https://github.com/TechnoServe/my-pima-back.git`
2. Navigate to the project directory: `cd my-pima-back`
3. Install dependencies: `npm install`
4. Configure the environment variables from .env.example (if applicable).

### **How to migrate postgres db**

- **Install sequelize-cli globally**

      npm install -g sequelize-cli

- **Generate migration file**

      sequelize migration:generate --name migration-name

- **Run migration**

      sequelize db:migrate

- **Undo migration**

      sequelize db:migrate:undo --name migration-name

## Usage

Use apollo studio to test the API

## API Documentation

Apollo Studio: [PIMA API documentation] (<https://studio.apollographql.com/sandbox/explorer?endpoint=https://api.pima.ink/graphql>)

## Run pre-required endpoints

- **load salesforce users**

-```javascript
query LoadSFUsers {
loadSFUsers {
message
status
total_new_users
}
}

- **load salesforce projects**

  -```javascript
  query LoadProjects {
  loadProjects {
  message
  status
  total_new_projects
  }
  }

- **load salesforce projects roles**

  -```javascript
  query LoadProjectRoles {
  loadProjectRoles {
  message
  status
  total_loaded
  }
  }

  -```javascript
  // Sample GraphQL query using Apollo Client
  import { ApolloClient, InMemoryCache, gql } from "@apollo/client";

const client = new ApolloClient({
uri: "<https://api.pima.ink/graphql>",
cache: new InMemoryCache(),
});

client
.query({
query: gql`query {
            // Your GraphQL query here
            }`,
})
.then((result) => console.log(result))
.catch((error) => console.error(error));
