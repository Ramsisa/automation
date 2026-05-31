import {
  IBinaryKeyData,
  IDataObject,
  IHttpRequestOptions,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
} from "n8n-workflow";

function buildApiBase(baseUrl: string, apiVersion: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/${apiVersion}`;
}

export class RamsisaTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Ramsisa Trigger",
    name: "ramsisaTrigger",
    icon: "file:ramsisa.svg",
    group: ["trigger"],
    version: 1,
    description:
      "Receives Ramsisa schedule completion webhooks. Copy this node's Production URL into the Webhook URL field of a Generate Schedule action.",
    defaults: { name: "Ramsisa Trigger" },
    inputs: [],
    outputs: ["main"],
    credentials: [{ name: "ramsisaApi", required: false }],
    webhooks: [
      {
        name: "default",
        httpMethod: "POST",
        responseMode: "onReceived",
        path: "ramsisa",
      },
    ],
    properties: [
      {
        displayName: "Enrich With Full Status",
        name: "enrichWithStatus",
        type: "boolean",
        default: true,
        description:
          "Whether to fetch the full schedule status from Ramsisa after receiving the webhook (gives you summary, created_at, completed_at, etc.). Requires credentials.",
      },
      {
        displayName: "Download CSV Attachment",
        name: "downloadCsv",
        type: "boolean",
        default: false,
        description:
          "Whether to download the schedule CSV as a binary attachment on this item. Only runs when status is completed. Requires credentials.",
      },
      {
        displayName: "Put Output File in Field",
        name: "binaryPropertyName",
        type: "string",
        default: "data",
        displayOptions: { show: { downloadCsv: [true] } },
      },
      {
        displayName: "Notice",
        name: "notice",
        type: "notice",
        default: "",
        typeOptions: { theme: "info" },
        description:
          "Copy this node's Production URL and pass it as `webhook_url` on a Generate Schedule call. Ramsisa POSTs here when the schedule is completed or failed.",
      },
    ],
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const body = this.getBodyData() as IDataObject;
    const enrich = this.getNodeParameter("enrichWithStatus", false) as boolean;
    const downloadCsv = this.getNodeParameter("downloadCsv", false) as boolean;
    const binaryPropertyName = this.getNodeParameter(
      "binaryPropertyName",
      "data",
    ) as string;

    const scheduleId = body.schedule_id as string | undefined;
    const status = body.status as string | undefined;

    let merged: IDataObject = { ...body };
    let binary: IBinaryKeyData | undefined;

    if ((enrich || downloadCsv) && scheduleId) {
      // Credentials are only needed for enrichment / download — degrade gracefully if missing.
      let credentials: IDataObject | undefined;
      try {
        credentials = (await this.getCredentials(
          "ramsisaApi",
        )) as unknown as IDataObject;
      } catch {
        credentials = undefined;
      }

      if (credentials) {
        const apiBase = buildApiBase(
          credentials.baseUrl as string,
          credentials.apiVersion as string,
        );

        if (enrich) {
          try {
            const statusOptions: IHttpRequestOptions = {
              method: "GET",
              url: `${apiBase}/schedules/${scheduleId}/`,
              json: true,
            };
            const fullStatus =
              (await this.helpers.httpRequestWithAuthentication.call(
                this,
                "ramsisaApi",
                statusOptions,
              )) as IDataObject;
            merged = { ...merged, ...fullStatus };
          } catch (e) {
            merged.enrichment_error = (e as Error).message;
          }
        }

        if (downloadCsv && status === "completed") {
          try {
            const dlOptions: IHttpRequestOptions = {
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
                dlOptions,
              )) as { body: Buffer | ArrayBuffer };
            const buffer = Buffer.isBuffer(response.body)
              ? response.body
              : Buffer.from(response.body);
            const file = await this.helpers.prepareBinaryData(
              buffer,
              `schedule_${scheduleId}.csv`,
              "text/csv",
            );
            binary = { [binaryPropertyName]: file };
          } catch (e) {
            merged.download_error = (e as Error).message;
          }
        }
      }
    }

    return {
      workflowData: [[binary ? { json: merged, binary } : { json: merged }]],
    };
  }
}
