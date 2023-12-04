const child_process = require('child_process');

if (process.env.NODE_ENV === "development") {
    console.log("Running postinstall for development");

    // Example: Run an npm command
    try {
        child_process.execSync('ts-patch install', { stdio: 'inherit' });
    } catch (error) {
        console.error(`Error running npm command: ${error.message}`);
        process.exit(1);
    }
}
