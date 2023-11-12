import type {Express} from "express-serve-static-core";
import {type KeycloakConnectorConfigCustom} from "../../types.js";
import {ExpressAdapter} from "./express-adapter.js";

// Adapter remains to create uniform implementations and ensure future expansion potential
export const keycloakConnectorExpress = async (app: Express, customConfig: KeycloakConnectorConfigCustom) => await ExpressAdapter.init(app, customConfig);
