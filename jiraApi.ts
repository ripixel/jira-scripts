import fetch from "node-fetch";

// JIRA_CREDS in the format of "username:password" - generated as a personal access token from Jira
// Add this in your bash/zsh rc as an export, or prefix `npm run x` with it, like `JIRA_CREDS=xxx npm run x`
const headers = {
  Authorization: `Basic ${Buffer.from(process.env.JIRA_CREDS!).toString(
    "base64"
  )}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

// JIRA_DOMAIN in the format of "https://[your_org].atlassian.net"
// Add this in your bash/zsh rc as an export, or prefix `npm run x` with it, like `JIRA_DOMAIN=xxx npm run x`
const domain = process.env.JIRA_DOMAIN!;
const boardId = 272;
const maxResults = 50;

export interface Sprint {
  id: number;
  self: string;
  state: string;
  name: string;
  startDate: string;
  endDate: string;
  completeDate: string;
  originBoardId: number;
  goal: string;
}

interface GetSprintResponse {
  maxResults: number;
  startAt: number;
  total: number;
  isLast: boolean;
  values: Sprint[];
}

export interface Issue {
  expand: string;
  id: string;
  self: string;
  key: string;
  fields: {
    summary: string;
    parent?: {
      id: string;
      key: string;
      self: string;
      fields: {
        summary: string;
      };
    };
    resolutionDate?: string;
    status: {
      self: string;
      description: string;
      iconUrl: string;
      name: string;
      id: string;
      statusCategory: {
        self: string;
        id: number;
        key: string;
        colorName: string;
        name: string;
      };
    };
    customfield_11922: number;
  };
}

interface GetIssuesForSprintResponse {
  expand: string;
  startAt: number;
  maxResults: number;
  total: number;
  issues: Issue[];
}

export interface Epic {
  id: number;
  self: string;
  name: string;
  summary: string;
  color: {
    key: string;
  };
  done: boolean;
}

interface GetEpicsResponse {
  maxResults: number;
  startAt: number;
  total: number;
  isLast: boolean;
  values: Epic[];
}

export const getCurrentSprint = async () => {
  let foundLastPage = false;
  let sprints: Sprint[] = [];

  while (foundLastPage === false) {
    const response = (await (
      await fetch(`${domain}/rest/agile/1.0/board/${boardId}/sprint`, {
        method: "GET",
        headers,
      })
    ).json()) as GetSprintResponse;
    foundLastPage = response.isLast;
    sprints.push(...response.values);
  }

  return sprints!.find((sprint) => {
    const now = Date.now();
    return (
      Date.parse(sprint.endDate) > now && Date.parse(sprint.startDate) < now
    );
  })!;
};

export const getNextSprint = async () => {
  let foundLastPage = false;
  let sprints: Sprint[] = [];

  while (foundLastPage === false) {
    const response = (await (
      await fetch(`${domain}/rest/agile/1.0/board/${boardId}/sprint`, {
        method: "GET",
        headers,
      })
    ).json()) as GetSprintResponse;
    foundLastPage = response.isLast;
    sprints.push(...response.values);
  }

  return sprints!.find((sprint) => {
    const now = Date.now();
    return Date.parse(sprint.startDate) > now;
  })!;
};

export const getPreviousSprint = async () => {
  let foundLastPage = false;
  let sprints: Sprint[] = [];

  while (foundLastPage === false) {
    const response = (await (
      await fetch(`${domain}/rest/agile/1.0/board/${boardId}/sprint`, {
        method: "GET",
        headers,
      })
    ).json()) as GetSprintResponse;
    foundLastPage = response.isLast;
    sprints.push(...response.values);
  }

  return sprints!.find((sprint) => {
    const twoWeeksAgo = Date.now() - 1209600000; // minus two weeks ago in milliseconds: 1000 * 60 * 60 * 24 * 14
    return (
      Date.parse(sprint.endDate) > twoWeeksAgo &&
      Date.parse(sprint.startDate) < twoWeeksAgo
    );
  })!;
};

export const getEpics = async () => {
  let foundAllEpics = false;
  let lastStartAtIndex = 0;
  let epics: Epic[] = [];

  while (!foundAllEpics) {
    const response = (await (
      await fetch(
        `${domain}/rest/agile/1.0/board/${boardId}/epic?startAt=${lastStartAtIndex}`,
        {
          method: "GET",
          headers,
        }
      )
    ).json()) as GetEpicsResponse;

    epics = [...epics, ...response.values];

    if (response.isLast) {
      foundAllEpics = true;
    } else {
      lastStartAtIndex += maxResults;
    }
  }

  return epics;
};

export const getIssuesForSprint = async (sprintId: number) => {
  let foundAllIssues = false;
  let lastStartAtIndex = 0;
  let issues: Issue[] = [];

  while (!foundAllIssues) {
    const response = (await (
      await fetch(
        `${domain}/rest/agile/1.0/sprint/${sprintId}/issue?startAt=${lastStartAtIndex}&fields=issuekey,summary,status,parent,resolutiondate,customfield_11922`,
        {
          method: "GET",
          headers,
        }
      )
    ).json()) as GetIssuesForSprintResponse;

    issues = [...issues, ...response.issues];

    if (response.total < lastStartAtIndex + maxResults) {
      foundAllIssues = true;
    } else {
      lastStartAtIndex += maxResults;
    }
  }

  return issues;
};

export enum SPRINT {
  NEXT,
  CURRENT,
  PREVIOUS,
}

export const getLegitimateIssuesForSprint = async (
  sprintRequested: SPRINT = SPRINT.CURRENT
) => {
  let sprint: Sprint;
  switch (sprintRequested) {
    case SPRINT.PREVIOUS:
      sprint = await getPreviousSprint();
      break;
    case SPRINT.CURRENT:
      sprint = await getCurrentSprint();
      break;
    case SPRINT.NEXT:
      sprint = await getNextSprint();
      break;
  }
  const issues = await getIssuesForSprint(sprint.id);

  return issues.filter((issue) => {
    const resolutionDate = issue.fields.resolutionDate;

    if (!resolutionDate) {
      return true;
    }

    return Date.parse(resolutionDate) > Date.parse(sprint.startDate);
  });
};
