import type { IssuePriority, IssueType, StateCategory } from "@prisma/client";

export type BoardIssue = {
  id: string;
  number: number;
  title: string;
  type: IssueType;
  priority: IssuePriority;
  position: string;
  version: number;
  storyPoints: number | null;
  dueDate: Date | null;
  assignee: { id: string; name: string; imageUrl: string | null } | null;
  labels: { label: { id: string; name: string; color: string } }[];
  _count: { comments: number };
};

export type BoardColumnData = {
  id: string;
  name: string;
  position: number;
  wipLimit: number | null;
  state: { id: string; name: string; category: StateCategory };
  issues: BoardIssue[];
};

export type BoardData = {
  project: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    visibility: "ORG" | "PRIVATE";
  };
  columns: BoardColumnData[];
  role: "NONE" | "VIEWER" | "MEMBER" | "ADMIN" | "OWNER";
  orgId: string;
};
