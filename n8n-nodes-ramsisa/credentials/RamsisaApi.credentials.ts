import {
  IAuthenticateGeneric,
  Icon,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from "n8n-workflow";

export class RamsisaApi implements ICredentialType {
  name = "ramsisaApi";
  displayName = "Ramsisa API";
  documentationUrl = "https://ramsisa.com/docs/integrations/n8n";
  icon: Icon = "file:icons/ramsisa.svg";

  properties: INodeProperties[] = [
    {
      displayName: "Base URL",
      name: "baseUrl",
      type: "string",
      default: "https://schedule.ramsisa.com",
      placeholder: "https://schedule.ramsisa.com",
      description: "Root URL of the Ramsisa service. No trailing /api segment.",
    },
    {
      displayName: "API Version",
      name: "apiVersion",
      type: "options",
      default: "v1",
      description:
        "API version this connection targets. Each major API version is pinned so existing workflows do not break when a new version ships.",
      options: [{ name: "v1", value: "v1" }],
    },
    {
      displayName: "API Key",
      name: "apiKey",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      description: "Bearer token issued by your Ramsisa organization admin.",
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: "generic",
    properties: {
      headers: {
        Authorization: "=Bearer {{$credentials.apiKey}}",
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: "={{$credentials.baseUrl}}",
      url: "=/api/{{$credentials.apiVersion}}/health/",
      method: "GET",
    },
  };
}
