// Generate graph
export function generateGraph(nodes: number) {
    const connectionData: string[] = [];
    const graphData: Record<string, string[]> = {

    }

    // Generate the nodes
    for (let i = 0; i < nodes; i++) {
        // Create the initial spot
        graphData[`${i}`] = [];

        // Randomly assign neighbors
        for (let j = 0; j < Math.floor(Math.random()*5); j++) {
            const neighbor = Math.floor(Math.random()*nodes);
            if (neighbor === i) continue;
            connectionData.push(`${i}>${neighbor}`);
            graphData[`${i}`]!.push(`${neighbor}`);
        }
    }

    // const outputString = connectionData.join('\n');
    // console.log(connectionData);
    return graphData;
}

