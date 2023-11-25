import React, {useEffect} from "react";
import {useKeycloakConnector} from "./KeycloakConnectorProvider.js";


export const Authorization = () => {

    const kccContext = useKeycloakConnector();

    useEffect(() => {
        // Initialize the authorization check
        kccContext.start();
    }, []);

    return (
        <div>You must login. Muhaha</div>
    )
}
