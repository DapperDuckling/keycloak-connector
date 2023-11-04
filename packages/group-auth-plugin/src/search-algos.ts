import {type Deferred} from "keycloak-connector-server/dist/helpers/utils.js";
import {tr} from "@faker-js/faker";

export const deferredFactory = <T = unknown>(): Deferred<T> => {
    const result = {};
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    result.promise = new Promise(function(resolve, reject) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        result.resolve = resolve;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        result.reject = reject;
    });
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return result;
};
// const nodes: Record<string, string[]> = {
//     a: ["b"],
//     b: ["c"],
//     c: ["d","e"],
//     d: ["e"],
//     e: ["c","f"],
//     f: [],
// }
// const nodes: Record<string, string[]> = {
//     a: ["b"],
//     b: ["c"],
//     c: ["d","e"],
//     d: ["e"],
//     e: ["c","f","g"],
//     f: [],
//     g: ["d", "h"],
//     h: ["i", "e"],
//     i: ["g"],
// }

export function depth(nodes: Record<string, string[]>) {
    const treePermissions: Record<string, Set<string>> = {};

    function dfs(permission: string, visitedNodes: Set<string>) {
        // // Check if this permission was visited already
        // if (treePermissions[permission]) return;

        // Add this permission to the tree
        treePermissions[permission] ??= new Set<string>([permission]);

        // Add this node to the tracker
        visitedNodes.add(permission);

        // Loop over the children of this permission
        for (const child of nodes?.[permission] ?? []) {
            // // Check if the child permission was visited already
            // if (treePermissions[child]) continue;

            // Check if the child permission was visited already
            if (!visitedNodes.has(child)) dfs(child, visitedNodes);

            // Add each of the children permissions to this node's permission list
            treePermissions[child]!.forEach(childPermission => treePermissions[permission]!.add(childPermission));
        }
    }

    for (const permission in nodes) {
        //todo: make this more efficient so we're not vising the same nodes over and over again
        dfs(permission, new Set());
    }

    return treePermissions;
}

export async function depth2(nodes: Record<string, string[]>) {

    const nodeConnections: Record<string, Set<string>> = {}

    function dagWalk(node: string, visitingNodes: Map<string, Deferred<string[]>>): Promise<string[]> | string[] {

        // Check if this node has no neighbors
        const neighbors = nodes[node];
        if (neighbors === undefined) return [node];

        // Check if we are already walking this node
        if (visitingNodes.has(node)) return visitingNodes.get(node)!.promise;

        // Generate a deferred promise
        const deferredWalk = deferredFactory<string[]>();

        // Store the visiting nodes
        visitingNodes.set(node, deferredWalk);

        // Store a list of reachable nodes
        nodeConnections[node] ??= new Set<string>([node]);

        // Grab reference to set
        const reachableNodes = nodeConnections[node]!;

        // Store a list of promises
        const promises = new Set<Promise<string []>>();

        // Loop over the children of this permission
        for (const neighbor of neighbors) {
            // Save this reachable node
            reachableNodes.add(neighbor);

            // Walk the other node
            const neighborNodes = dagWalk(neighbor, visitingNodes);

            // Check if the neighbor node is a promise
            if (!Array.isArray(neighborNodes)) {
                promises.add(neighborNodes);
                continue;
            }

            // Store the neighbor nodes
            neighborNodes.forEach(neighborNode => reachableNodes.add(neighborNode));
        }

        // Resolve the deferred promise
        deferredWalk.resolve(Array.from(reachableNodes));

        // Combine promises
        const finalPromises: Promise<Set<string>>[] = [];
        for (const promise of promises) {
            const neighborPromise = promise.then(neighbors => {
                for (const neighborNode of neighbors) {
                    // nodeConnections[node]!.push(neighborNode);
                    nodeConnections[node]!.add(neighborNode);
                }

                return nodeConnections[node]!;
            });

            finalPromises.push(neighborPromise);
        }

        return Promise.all(finalPromises).then(finalResults => {
            finalResults.forEach(neighbors => neighbors.forEach(neighbor => nodeConnections[node]!.add(neighbor)));
            return [...nodeConnections[node]!];
        });
    }

    for (const node of Object.keys(nodes)) {
        void await dagWalk(node, new Map());
    }

    return nodeConnections;
}

