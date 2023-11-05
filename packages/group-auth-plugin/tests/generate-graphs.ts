// Generate graph
import {depthFirstSearch} from "../src/index.js";

export function generateGraph(nodes: number) {
    const connectionData: string[] = [];
    const graphData: Record<string, string[]> = {}

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

// Perform test of different algo
for (let i=0; i<100; i++) {
    console.log(`Starting ${i}`);
    const graph = generateGraph(200);
    console.log(`\t${i} - graph generated`);
    depthFirstSearch(graph);
    console.log(`\t${i} - depth1`);
    // const result2 = await depth2(graph);
    // console.log(`\t${i} - depth2`);
    // const isMatch = compareResults(result1, result2);
    // if (!isMatch) throw new Error(`NOt a match!!`);
    // console.log(`\t${i} ** matched!`);
}
