export function depthFirstSearch(nodes: Record<string, string[]>) {
    const treePermissions: Record<string, Set<string>> = {};

    function dfs(permission: string, visitedNodes: Set<string>) {
        // Add this permission to the tree
        treePermissions[permission] ??= new Set<string>([permission]);

        // Add this node to the tracker
        visitedNodes.add(permission);

        // Loop over the children of this permission
        for (const child of nodes?.[permission] ?? []) {
            // Check if the child permission was visited already
            if (!visitedNodes.has(child)) dfs(child, visitedNodes);

            // Add each of the children permissions to this node's permission list
            treePermissions[child]!.forEach(childPermission => treePermissions[permission]!.add(childPermission));
        }
    }

    for (const permission in nodes) {
        dfs(permission, new Set());
    }

    return treePermissions;
}

