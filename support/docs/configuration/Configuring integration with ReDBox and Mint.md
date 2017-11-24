# Configuring integration with ReDBox and Mint

## Introduction

For record management, the ReDBox portal utilises the APIs provided by both the [ReDBox and Mint applications](http://www.redboxresearchdata.com.au/).

## Configuring API access

The `config/record.js` file provides configuration properties to set the URLs the services can be accessed on as well as the API endpoints.

```
baseUrl
|
|- redbox
|
|- mint
|
api
|
|- <action>
     |
     |- method
     |
     |- url
```
Where <> are property labels that are variables.

| Field            | Description                                                                                                                                                                              | Required | Example        |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|----------------|
| baseUrl    | Section used to capture the base URLs for ReDBox and Mint to reduce duplication of variables and easier cross environment configuration | Yes      | N/A           |
| baseUrl/redbox    | The base url for the ReDBox instance the portal is integrating with. | Yes      | http://localhost:9000/redbox           |
| baseUrl/mint    | The base url for the Mint instance the portal is integrating with. | Yes      | http://localhost:9001/mint          |
| api    | Section used to capture the api endpoints for ReDBox and Mint | Yes      | N/A           |
| api/< action >    | The API action that is being configured. Can be one of create, search, getMeta, updateMeta and harvest. | Yes      | create        |
| api/< action >/method    | The HTTP method used by the API end point | Yes      | get          |
| api/< action >/url    | The url for the API endpoint | Yes      | /api/v1/object/$packageType          |

#### Example
```
  baseUrl: {
    redbox: "http://localhost:9000/redbox",
    mint: "http://localhost:9001/mint"
  },
  api: {
    create: {method: 'post', url: "/api/v1/object/$packageType"},
    search: {method: 'get', url: "/api/v1/search"},
    getMeta: {method: 'get', url: "/api/v1/recordmetadata/$oid"},
    updateMeta: {method: 'post', url: "/api/v1/recordmetadata/$oid"},
    harvest: {method: 'post', url:"/api/v1.1/harvest/$packageType"}
  }
```
