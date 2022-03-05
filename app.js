const express = require("express");
const app = express();
app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");

const path = require("path");
const databasePath = path.join(__dirname, "covid19IndiaPortal.db");
let database = null;

const startServer = async () => {
  try {
    database = await open({ filename: databasePath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("The server is running at http://localhost:3000");
    });
  } catch (err) {
    console.log(`DB Error:${err.message}`);
    process.exit(1);
  }
};
startServer();

//3.AUTHENTICATE USER API
const authenticateUser = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "The_Secret", async (error, user) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

//CONVERSION AS PER RESULT REQUIREMENT

const convertStateObjtoDBObj = (baseObj) => {
  return {
    stateId: baseObj.state_id,
    stateName: baseObj.state_name,
    population: baseObj.population,
  };
};

const convertDistrictTODBObj = (baseObj) => {
  return {
    districtId: baseObj.district_id,
    districtName: baseObj.district_name,
    stateId: baseObj.state_id,
    cases: baseObj.cases,
    cured: baseObj.cured,
    active: baseObj.active,
    deaths: baseObj.deaths,
  };
};

const convertDistrictObj = (baseObj) => {};
//4.GET STATES API

app.get("/states/", authenticateUser, async (request, response) => {
  const selectStatesQuery = `SELECT * FROM state ORDER BY state_id;`;
  const dbState = await database.all(selectStatesQuery);
  response.send(dbState.map((eachState) => convertStateObjtoDBObj(eachState)));
});

//5.GET STATES ON ID API
app.get("/states/:stateId/", authenticateUser, async (request, response) => {
  const { stateId } = request.params;
  const selectStatesQuery = `SELECT * FROM state WHERE state_id = ${stateId};`;
  const dbState = await database.get(selectStatesQuery);
  response.send(convertStateObjtoDBObj(dbState));
});

//6. GET DISTRICT API
app.get("/districts/", authenticateUser, async (request, response) => {
  const selectDistrictQuery = `SELECT * FROM district ORDER BY district_id;`;
  const dbDistrict = await database.all(selectDistrictQuery);
  response.send(
    dbDistrict.map((eachDistrict) => convertDistrictTODBObj(eachDistrict))
  );
});

//7. GET DISTRICT ON ID API
app.get(
  "/districts/:districtId/",
  authenticateUser,
  async (request, response) => {
    const { districtId } = request.params;
    const selectDistrictQuery = `SELECT * FROM district WHERE district_id = ${districtId};`;
    const dbDistrict = await database.get(selectDistrictQuery);
    response.send(convertDistrictTODBObj(dbDistrict));
  }
);

//8.DELETE DISTRICT ON ID API
app.delete(
  "/districts/:districtId/",
  authenticateUser,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `DELETE FROM district WHERE district_id = ${districtId};`;
    await database.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

//9.UPDATE DISTRICT ON ID API
app.put(
  "/districts/:districtId/",
  authenticateUser,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    if (districtId !== undefined) {
      const putDistrictQuery = `
    UPDATE district SET 
        district_name = '${districtName}',
        state_id = ${stateId},
        cases = ${cases},
        cured = ${cured},
        active = ${active},
        deaths = ${deaths}
    WHERE district_id = ${districtId}`;
      const dbUser = await database.run(putDistrictQuery);
      response.send("District Details Updated");
    } else {
      response.send("District Id Deleted");
    }
  }
);

//10.CREATE DISTRICT API
app.post("/districts/", authenticateUser, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;

  const createDistrictQuery = `
  INSERT INTO district (district_name,state_id,cases,cured,active,deaths)
    values(
        '${districtName}',
        ${stateId},
        ${cases},
        ${cured},
        ${active},
        ${deaths}
    );`;
  const dbDistrict = await database.run(createDistrictQuery);
  response.send("District Successfully Added");
});

//11.STATE  ID STATS API
app.get(
  "/states/:stateId/stats/",
  authenticateUser,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateStatsQuery = `
        select sum(cases) as totalCases,
        sum(cured) as totalCured,
        sum(active) as totalActive,
        sum(deaths) as totalDeaths
    from district
    where state_id = ${stateId};`;
    const stateStats = await database.get(getStateStatsQuery);
    response.send(stateStats);
  }
);

//1.REGISTER USER API
app.post("/users/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashPwd = await bcrypt.hash(password, 15);
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = db.get(selectUserQuery);
  if (dbUser === undefined) {
    const addUserQuery = `INSERT INTO user (username,name,password,gender,location)
        VALUES
            '${username}',
            '${name}',
            '${hashPwd}',
            '${gender}',
            '${location}';`;
    await database.run(addUserQuery);
    response.send("User added successfully");
  } else {
    response.status(400);
    response.send("Username already exists");
  }
});

//2.LOGIN USER API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await database.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    //compare password
    const isPwdMatch = await bcrypt.compare(password, dbUser.password);
    if (isPwdMatch === true) {
      const payload = { username: username };

      //USING JWT
      const jwtToken = jwt.sign(payload, "The_Secret");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

module.exports = app;
