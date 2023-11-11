// @ts-nocheck
const seed = Math.random().toString(36);
let delayTimeout = null;
let oneMore = false;

const updateBackground = () => {
    const backgroundElem = document.querySelector("#background").getClientRects()[0];
    const pattern = trianglify({
        seed: seed,
        cellSize: 50,
        width: backgroundElem.width,
        height: backgroundElem.height,
    });

    // Paint to canvas
    const canvas = document.querySelector("#canvas");
    pattern.toCanvas(canvas);

    // Clear timeout flag
    delayTimeout = null;

    // Check for one more flag
    if (oneMore) {
        registerPendingUpdate();
        oneMore = false;
    }
};

const registerPendingUpdate = () => {
    delayTimeout = setTimeout(() => updateBackground(), 10);
}

addEventListener("resize", (event) => {
    if (delayTimeout !== null) {
        oneMore = true;
        return;
    }
    registerPendingUpdate();
});

window.addEventListener('load', registerPendingUpdate);

document.addEventListener("DOMContentLoaded", function () {
    const container = document.getElementById("modal");

    document.addEventListener("mousemove", function (e) {
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        const containerX = container.offsetLeft + container.offsetWidth / 2;
        const containerY = container.offsetTop + container.offsetHeight / 2;

        // Calculate the distance between the cursor and the center of the container
        const distanceX = mouseX - containerX;
        const distanceY = mouseY - containerY;

        // Adjust the box-shadow based on the cursor position to be on the opposite side
        const offsetX = (distanceX / 10) * -0.5;
        const offsetY = (distanceY / 10) * -0.5;

        container.style.boxShadow = `${offsetX}px ${offsetY}px 40px rgba(0, 0, 0, 0.3)`;
    });
});
