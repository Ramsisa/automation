import {
  IDataObject,
  IExecuteFunctions,
  IHttpRequestOptions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
} from "n8n-workflow";

function parseJsonParam(
  ctx: IExecuteFunctions,
  itemIndex: number,
  name: string,
): unknown {
  const raw = ctx.getNodeParameter(name, itemIndex);
  if (typeof raw === "string") {
    if (raw.trim() === "") return undefined;
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new NodeOperationError(
        ctx.getNode(),
        `Parameter "${name}" is not valid JSON: ${(e as Error).message}`,
        { itemIndex },
      );
    }
  }
  return raw;
}

function buildApiBase(baseUrl: string, apiVersion: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/${apiVersion}`;
}

export class Ramsisa implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Ramsisa",
    name: "ramsisa",
    icon: "file:ramsisa.svg",
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: "Generate and manage Ramsisa field visit schedules.",
    defaults: { name: "Ramsisa" },
    inputs: ["main"],
    outputs: ["main"],
    credentials: [{ name: "ramsisaApi", required: true }],
    properties: [
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        options: [
          {
            name: "Generate Schedule",
            value: "generate",
            action: "Generate a schedule",
            description:
              "Submit a new schedule generation request (returns immediately with a schedule_id)",
          },
          {
            name: "Generate Schedule (Wait for Completion)",
            value: "generateAndWait",
            action: "Generate a schedule and wait for completion",
            description:
              "Submit a schedule, then poll until it completes or fails. Returns the final status (and optionally the CSV) in a single synchronous step. Use when you don't want to wire up a webhook trigger.",
          },
          {
            name: "Get Schedule Status",
            value: "getStatus",
            action: "Get schedule status",
            description: "Check the status of a previously submitted schedule",
          },
          {
            name: "Download Schedule CSV",
            value: "download",
            action: "Download schedule CSV",
            description:
              "Download the generated schedule as a CSV binary attachment",
          },
        ],
        default: "generateAndWait",
      },

      // ===== Generate =====
      {
        displayName: "Locations",
        name: "locations",
        type: "json",
        required: true,
        default: "[]",
        description:
          "Array of location objects. Each item: { id, name, tier (A|B|C), territory, latitude, longitude, available_from?, available_to?, available_days? }. See https://schedule.ramsisa.com/docs/api-reference/ for full field details.",
        displayOptions: {
          show: { operation: ["generate", "generateAndWait"] },
        },
      },
      {
        displayName: "Month",
        name: "month",
        type: "string",
        required: true,
        default: "",
        placeholder: "2026-06",
        description:
          "Target month in YYYY-MM format. Working days (Sat-Wed) are auto-computed.",
        displayOptions: {
          show: { operation: ["generate", "generateAndWait"] },
        },
      },
      {
        displayName: "Webhook URL",
        name: "webhookUrl",
        type: "string",
        default: "",
        placeholder: "https://your-n8n.example.com/webhook/ramsisa",
        description:
          "Optional. URL Ramsisa will POST to when the schedule completes or fails. Use the Production URL from a Ramsisa Trigger node downstream.",
        displayOptions: { show: { operation: ["generate"] } },
      },
      {
        displayName: "Additional Fields",
        name: "additionalFields",
        type: "collection",
        placeholder: "Add Field",
        default: {},
        displayOptions: {
          show: { operation: ["generate", "generateAndWait"] },
        },
        options: [
          {
            displayName: "Visits Completed",
            name: "visits_completed",
            type: "json",
            default: "[]",
            description:
              "Period 2 only. Array of { location_id, date (YYYY-MM-DD) } entries already visited.",
          },
          {
            displayName: "Monthly Target",
            name: "monthly_target",
            type: "json",
            default: '{"A":3,"B":2,"C":1}',
            description: "Monthly visit target per tier",
          },
          {
            displayName: "Period Target",
            name: "period_target",
            type: "json",
            default: '{"A":2,"B":1,"C":1}',
            description: "Per-period (bi-weekly) target per tier",
          },
          {
            displayName: "Excluded Days",
            name: "excluded_days",
            type: "json",
            default: "[]",
            description:
              'Array of YYYY-MM-DD dates to skip (e.g. ["2026-06-08"])',
          },
        ],
      },

      // ===== Generate (Wait for Completion) =====
      {
        displayName: "Poll Interval (Seconds)",
        name: "pollIntervalSec",
        type: "number",
        default: 5,
        typeOptions: { minValue: 1 },
        description: "How often to poll the schedule status while waiting",
        displayOptions: { show: { operation: ["generateAndWait"] } },
      },
      {
        displayName: "Max Wait (Seconds)",
        name: "maxWaitSec",
        type: "number",
        default: 600,
        typeOptions: { minValue: 1 },
        description:
          "Fail the node if the schedule has not reached a terminal state within this many seconds. Defaults to 10 minutes — raise for larger schedules, but mind n8n's own execution timeout.",
        displayOptions: { show: { operation: ["generateAndWait"] } },
      },
      {
        displayName: "Download CSV",
        name: "downloadCsv",
        type: "boolean",
        default: false,
        description:
          "Whether to fetch the CSV as a binary attachment when the schedule completes",
        displayOptions: { show: { operation: ["generateAndWait"] } },
      },
      {
        displayName: "Put Output File in Field",
        name: "binaryPropertyName",
        type: "string",
        default: "data",
        displayOptions: {
          show: { operation: ["generateAndWait"], downloadCsv: [true] },
        },
      },

      // ===== Get Status / Download =====
      {
        displayName: "Schedule ID",
        name: "scheduleId",
        type: "string",
        required: true,
        default: "",
        description: "UUID returned from a Generate Schedule call",
        displayOptions: { show: { operation: ["getStatus", "download"] } },
      },

      // ===== Download =====
      {
        displayName: "Put Output File in Field",
        name: "binaryPropertyName",
        type: "string",
        required: true,
        default: "data",
        description: "Name of the binary field that will hold the CSV",
        displayOptions: { show: { operation: ["download"] } },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const credentials = await this.getCredentials("ramsisaApi");
    const apiBase = buildApiBase(
      credentials.baseUrl as string,
      credentials.apiVersion as string,
    );

    for (let i = 0; i < items.length; i++) {
      const operation = this.getNodeParameter("operation", i) as string;

      try {
        if (operation === "generate") {
          const locations = parseJsonParam(this, i, "locations");
          const month = this.getNodeParameter("month", i) as string;
          const webhookUrl = (
            this.getNodeParameter("webhookUrl", i, "") as string
          ).trim();
          const additional = this.getNodeParameter(
            "additionalFields",
            i,
            {},
          ) as IDataObject;

          const body: IDataObject = {
            locations: locations as IDataObject[],
            month,
          };
          if (webhookUrl) body.webhook_url = webhookUrl;

          for (const key of [
            "visits_completed",
            "monthly_target",
            "period_target",
            "excluded_days",
          ]) {
            const value = additional[key];
            if (value === undefined || value === null || value === "") continue;
            body[key] = typeof value === "string" ? JSON.parse(value) : value;
          }

          const options: IHttpRequestOptions = {
            method: "POST",
            url: `${apiBase}/schedules/generate/`,
            body,
            json: true,
          };
          const response =
            await this.helpers.httpRequestWithAuthentication.call(
              this,
              "ramsisaApi",
              options,
            );
          returnData.push({
            json: response as IDataObject,
            pairedItem: { item: i },
          });
        } else if (operation === "generateAndWait") {
          const locations = parseJsonParam(this, i, "locations");
          const month = this.getNodeParameter("month", i) as string;
          const additional = this.getNodeParameter(
            "additionalFields",
            i,
            {},
          ) as IDataObject;
          const pollIntervalSec = this.getNodeParameter(
            "pollIntervalSec",
            i,
            5,
          ) as number;
          const maxWaitSec = this.getNodeParameter(
            "maxWaitSec",
            i,
            600,
          ) as number;
          const downloadCsv = this.getNodeParameter(
            "downloadCsv",
            i,
            false,
          ) as boolean;
          const binaryPropertyName = this.getNodeParameter(
            "binaryPropertyName",
            i,
            "data",
          ) as string;

          const generateBody: IDataObject = {
            locations: locations as IDataObject[],
            month,
          };
          for (const key of [
            "visits_completed",
            "monthly_target",
            "period_target",
            "excluded_days",
          ]) {
            const value = additional[key];
            if (value === undefined || value === null || value === "") continue;
            generateBody[key] =
              typeof value === "string" ? JSON.parse(value) : value;
          }

          const generateRes =
            (await this.helpers.httpRequestWithAuthentication.call(
              this,
              "ramsisaApi",
              {
                method: "POST",
                url: `${apiBase}/schedules/generate/`,
                body: generateBody,
                json: true,
              } as IHttpRequestOptions,
            )) as IDataObject;

          const scheduleId = generateRes.schedule_id as string | undefined;
          if (!scheduleId) {
            throw new NodeOperationError(
              this.getNode(),
              `Generate did not return a schedule_id. Response: ${JSON.stringify(generateRes)}`,
              { itemIndex: i },
            );
          }

          const start = Date.now();
          let status: IDataObject = generateRes;
          // eslint-disable-next-line no-constant-condition
          while (true) {
            status = (await this.helpers.httpRequestWithAuthentication.call(
              this,
              "ramsisaApi",
              {
                method: "GET",
                url: `${apiBase}/schedules/${scheduleId}/`,
                json: true,
              } as IHttpRequestOptions,
            )) as IDataObject;
            const s = status.status as string | undefined;
            if (s === "completed" || s === "failed") break;
            if (Date.now() - start >= maxWaitSec * 1000) {
              throw new NodeOperationError(
                this.getNode(),
                `Timed out after ${maxWaitSec}s waiting for schedule ${scheduleId} (last status: ${s ?? "unknown"})`,
                { itemIndex: i },
              );
            }
            await new Promise((resolve) =>
              setTimeout(resolve, pollIntervalSec * 1000),
            );
          }

          const item: INodeExecutionData = {
            json: status,
            pairedItem: { item: i },
          };

          if (downloadCsv && status.status === "completed") {
            const dlRes =
              (await this.helpers.httpRequestWithAuthentication.call(
                this,
                "ramsisaApi",
                {
                  method: "GET",
                  url: `${apiBase}/schedules/${scheduleId}/download/`,
                  encoding: "arraybuffer",
                  returnFullResponse: true,
                  json: false,
                } as IHttpRequestOptions,
              )) as { body: Buffer | ArrayBuffer };
            const buffer = Buffer.isBuffer(dlRes.body)
              ? dlRes.body
              : Buffer.from(dlRes.body);
            const binary = await this.helpers.prepareBinaryData(
              buffer,
              `schedule_${scheduleId}.csv`,
              "text/csv",
            );
            item.binary = { [binaryPropertyName]: binary };
          }

          returnData.push(item);
        } else if (operation === "getStatus") {
          const scheduleId = (
            this.getNodeParameter("scheduleId", i) as string
          ).trim();
          if (!scheduleId) {
            throw new NodeOperationError(
              this.getNode(),
              "Schedule ID is required.",
              {
                itemIndex: i,
              },
            );
          }
          const options: IHttpRequestOptions = {
            method: "GET",
            url: `${apiBase}/schedules/${scheduleId}/`,
            json: true,
          };
          const response =
            await this.helpers.httpRequestWithAuthentication.call(
              this,
              "ramsisaApi",
              options,
            );
          returnData.push({
            json: response as IDataObject,
            pairedItem: { item: i },
          });
        } else if (operation === "download") {
          const scheduleId = (
            this.getNodeParameter("scheduleId", i) as string
          ).trim();
          const binaryPropertyName = this.getNodeParameter(
            "binaryPropertyName",
            i,
          ) as string;
          if (!scheduleId) {
            throw new NodeOperationError(
              this.getNode(),
              "Schedule ID is required.",
              {
                itemIndex: i,
              },
            );
          }
          const options: IHttpRequestOptions = {
            method: "GET",
            url: `${apiBase}/schedules/${scheduleId}/download/`,
            encoding: "arraybuffer",
            returnFullResponse: true,
            json: false,
          };
          const response =
            (await this.helpers.httpRequestWithAuthentication.call(
              this,
              "ramsisaApi",
              options,
            )) as { body: Buffer | ArrayBuffer };

          const buffer = Buffer.isBuffer(response.body)
            ? response.body
            : Buffer.from(response.body);
          const binary = await this.helpers.prepareBinaryData(
            buffer,
            `schedule_${scheduleId}.csv`,
            "text/csv",
          );
          returnData.push({
            json: { schedule_id: scheduleId },
            binary: { [binaryPropertyName]: binary },
            pairedItem: { item: i },
          });
        } else {
          throw new NodeOperationError(
            this.getNode(),
            `Unknown operation: ${operation}`,
            {
              itemIndex: i,
            },
          );
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: (error as Error).message },
            pairedItem: { item: i },
          });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}
