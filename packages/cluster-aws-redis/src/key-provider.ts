import {AbstractKeyProvider} from "keycloak-connector-server";
import type {ConnectorKeys} from "keycloak-connector-server";

export class KeyProvider extends AbstractKeyProvider {
    protected generateKeys(): Promise<ConnectorKeys> {
        return Promise.resolve(undefined);
    }

    /**
     *  things i want this plugin to do:
     *      - subscribe to an SNS topic and listen for messages
     *      - when a message comes in, handle it based on the message
     *      - messages
     *          - updates to public/private JWKs
     *          - backdoor comms from keycloak
     *      - obtaining locks will have to be based on (can we determine if all subscribers received a message?)
     */
}