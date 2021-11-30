import path from "path";
import { createObjectCsvWriter } from "csv-writer";
import { getLegitimateIssuesForSprint, Issue, SPRINT } from "./jiraApi";

const TEAMS = ["Athena", "Apollo", "Geosharding"];
const EPIC_MAPPING: { [key: string]: string | undefined } = {
  Geosharding: TEAMS[2],
  "Care Data Centre": TEAMS[0],
  "Care Live Tasks": TEAMS[0],
};
const NOT_MAPPED_TEAM = TEAMS[1];

let stats: Record<
  string,
  {
    totalPoints: number;
    totalNotStarted: number;
    totalStarted: number;
    totalDone: number;
  }
> = {};

const calculatePoints = (issues: Issue[], epicFilter?: string) => {
  let totalPoints = 0;
  let totalNotStarted = 0;
  let totalStarted = 0;
  let totalDone = 0;

  const ticketsToWorkOn = epicFilter
    ? issues.filter((ticket) =>
        ticket.fields.parent?.fields.summary.includes(epicFilter)
      )
    : issues;

  ticketsToWorkOn.forEach((ticket) => {
    const sp = ticket.fields.customfield_11922;
    totalPoints += sp;
    switch (ticket.fields.status.name) {
      case "Done":
        totalDone += sp;
        break;
      case "Prioritised":
      case "New":
        totalNotStarted += sp;
        break;
      default:
        totalStarted += sp;
    }
  });

  if (epicFilter) {
    const epicStat = EPIC_MAPPING[epicFilter]!;
    const epicStatObject = stats[epicStat];
    if (epicStatObject) {
      stats = {
        ...stats,
        [epicStat]: {
          totalPoints: epicStatObject.totalPoints + totalPoints,
          totalDone: epicStatObject.totalDone + totalDone,
          totalNotStarted: epicStatObject.totalNotStarted + totalNotStarted,
          totalStarted: epicStatObject.totalStarted + totalStarted,
        },
      };
    } else {
      stats = {
        ...stats,
        [epicStat]: {
          totalPoints,
          totalNotStarted,
          totalStarted,
          totalDone,
        },
      };
    }
  } else {
    stats = {
      ...stats,
      Total: {
        totalPoints,
        totalNotStarted,
        totalStarted,
        totalDone,
      },
    };
  }
};

const calculateEverythingElsePoints = () => {
  let teamTotalPoints = 0;
  let teamTotalNotStarted = 0;
  let teamTotalStarted = 0;
  let teamTotalDone = 0;

  TEAMS.filter((team) => team !== NOT_MAPPED_TEAM).forEach((team) => {
    const teamPoints = stats[team];
    teamTotalPoints += teamPoints.totalPoints;
    teamTotalNotStarted += teamPoints.totalNotStarted;
    teamTotalStarted += teamPoints.totalStarted;
    teamTotalDone += teamPoints.totalDone;
  });

  const totalObj = stats["Total"];

  stats[NOT_MAPPED_TEAM] = {
    totalPoints: totalObj.totalPoints - teamTotalPoints,
    totalNotStarted: totalObj.totalNotStarted - teamTotalNotStarted,
    totalStarted: totalObj.totalStarted - teamTotalStarted,
    totalDone: totalObj.totalDone - teamTotalDone,
  };
};

const createOutputCsv = async () => {
  const header = [
    {
      id: "epic",
      title: "Epic",
    },
    {
      id: "totalNotStarted",
      title: "Not Started",
    },
    {
      id: "totalStarted",
      title: "Started",
    },
    {
      id: "totalDone",
      title: "Done",
    },
  ];

  const records = Object.keys(stats).map((key) => {
    return {
      ...stats[key],
      epic: key,
    };
  });

  const csvWriter = createObjectCsvWriter({
    path: path.join(__dirname, "Output.csv"),
    header,
  });

  await csvWriter.writeRecords(records);
};

export const run = async (sprintRequested: SPRINT) => {
  const issues = await getLegitimateIssuesForSprint(sprintRequested);
  calculatePoints(issues);
  Object.keys(EPIC_MAPPING).forEach((epic) => {
    calculatePoints(issues, epic);
  });
  calculateEverythingElsePoints();
  Object.keys(stats).forEach((key) => {
    if (stats[key].totalPoints === 0) {
      delete stats[key];
    }
  });
  await createOutputCsv();
  console.log(stats);
};
