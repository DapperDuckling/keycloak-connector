import {Button} from "@mui/material";
import {useKeycloakConnector, KccDispatchType} from "@dapperduckling/keycloak-connector-react";

export const Content = () => {
    const [kccContext, kccDispatch] = useKeycloakConnector();
    const startIfNotStarted = () => kccContext.kccClient?.isStarted() || kccContext.kccClient?.start();
    return (
        <div>
            <h2>This is an example of the DapperDuckling React Plugin</h2>
            {!kccContext.userStatus.loggedIn ?
                <div>
                <Button onClick={() => {
                    startIfNotStarted();
                    kccDispatch({type: KccDispatchType.SHOW_LOGIN});
                    kccContext.kccClient?.prepareToHandleNewWindowLogin(); // This function should be called much earlier in practice
                    kccContext.kccClient?.handleLogin(true);
                }}>Login Now</Button>
                <Button onClick={() => {
                    startIfNotStarted();
                    kccDispatch({type: KccDispatchType.SHOW_LOGIN});
                    setTimeout(() => kccContext.kccClient?.authCheck(), 0);
                }}>Show Login Modal</Button>
            </div> : <div>
                <Button onClick={() => {
                    if (kccContext.kccClient?.isStarted() !== true) return;
                    kccDispatch({type: KccDispatchType.EXECUTING_LOGOUT});
                    kccContext.kccClient?.handleLogout();
                }}>Logout Now</Button>
                <Button onClick={() => {
                    if (kccContext.kccClient?.isStarted() !== true) return;
                    kccDispatch({type: KccDispatchType.SHOW_LOGOUT});
                }}>Show Logout Modal</Button>
            </div>
            }
        </div>
    )
}
