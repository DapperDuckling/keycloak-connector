import {Button} from "@mui/material";
import {useKeycloakConnector, KccDispatchType} from "@dapperduckling/keycloak-connector-react";

export const Content = () => {
    const [kccContext, kccDispatch] = useKeycloakConnector();
    const startIfNotStarted = () => kccContext.kccClient?.isStarted() || kccContext.kccClient?.start();

    const refreshProfile = async () => {
        console.log('forcing reauth check');
        await kccContext.kccClient?.authCheck(true); // note: kccClient will not handle more than one request at a time
        console.log('done forcing reauth check');
    };

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

            <h3>Example of force refresh of user data</h3>
            <Button onClick={refreshProfile}>Force refresh of user data</Button>
            <Button onClick={() => {
                const result = kccContext.kccClient?.authCheckNoWait();
                console.log(result);
            }}>No wait auth check</Button>
            <div><sub><b>Delete your access token first, if you want to see "accessExpires" change</b></sub></div>
            <div>
                <h4>UI Data</h4>
                    {JSON.stringify(kccContext.ui)}
                <h4>User Data</h4>
                <div>
                    {JSON.stringify(kccContext.userStatus)}
                </div>
            </div>
        </div>
    )
}
