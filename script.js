document.addEventListener('DOMContentLoaded', () => {
    const gridContainer = document.getElementById('grid-container');
    const runButton = document.getElementById('run-instance'); // Renamed from start-pause
    // const randomizeButton = document.getElementById('randomize'); // Can remove or repurpose later
    const currencyDisplay = document.getElementById('currency-display');
    const generationDisplay = document.getElementById('generation-display'); // Optional: show generation count

    // --- Config --- //
    const gridWidth = 40;
    const gridHeight = 20;
    const maxGenerationsPerRun = 500; // Safety limit
    const runStepDelay = 50; // ms delay between steps for visualization, 0 for max speed

    const cellStates = {
        DEAD: 0,
        NEW: 1,
        STABLE: 2,
        DYING: 3
    };
    const cellChars = {
        [cellStates.DEAD]: ' ',
        [cellStates.NEW]: '*',
        [cellStates.STABLE]: '#',
        [cellStates.DYING]: '.'
    };

    // --- State --- //
    let grid = createGrid(gridWidth, gridHeight);
    let isRunningInstance = false;
    let intervalId = null;
    let lastRenderedGridString = "";
    let playerCurrency = 0;
    let currentGeneration = 0;

    // --- Persistence --- //
    function loadGame() {
        const savedCurrency = localStorage.getItem('asciiLifeCurrency');
        if (savedCurrency !== null) {
            playerCurrency = parseInt(savedCurrency, 10);
        }
        updateCurrencyDisplay();
        // TODO: Load upgrades later
    }

    function saveGame() {
        localStorage.setItem('asciiLifeCurrency', playerCurrency.toString());
        // TODO: Save upgrades later
    }

    function updateCurrencyDisplay() {
        currencyDisplay.textContent = `Currency: ${playerCurrency}`;
    }

    // --- Core Logic --- //

    function createGrid(width, height) {
        return Array.from({ length: height }, () => Array(width).fill(cellStates.DEAD));
    }

    function areGridsIdentical(grid1, grid2) {
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                if (grid1[y][x] !== grid2[y][x]) {
                    return false;
                }
            }
        }
        return true;
    }

    function randomizeGrid() {
        grid = grid.map(row => row.map(() => (Math.random() < 0.3 ? cellStates.NEW : cellStates.DEAD)));
        lastRenderedGridString = ""; // Reset cache
        currentGeneration = 0;
        updateGenerationDisplay();
        renderGrid();
    }

    function getNeighborCount(x, y) {
        let count = 0;
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                if (i === 0 && j === 0) continue;
                const nx = (x + i + gridWidth) % gridWidth;
                const ny = (y + j + gridHeight) % gridHeight;
                if (grid[ny][nx] === cellStates.NEW || grid[ny][nx] === cellStates.STABLE) {
                    count++;
                }
            }
        }
        return count;
    }

    function updateGrid() {
        const nextGrid = createGrid(gridWidth, gridHeight);
        let changed = false;
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                const neighbors = getNeighborCount(x, y);
                const currentState = grid[y][x];
                let nextState = currentState;

                switch (currentState) {
                    case cellStates.DEAD:
                        if (neighbors === 3) nextState = cellStates.NEW;
                        break;
                    case cellStates.NEW:
                        nextState = (neighbors === 2 || neighbors === 3) ? cellStates.STABLE : cellStates.DYING;
                        break;
                    case cellStates.STABLE:
                        if (neighbors !== 2 && neighbors !== 3) nextState = cellStates.DYING;
                        break;
                    case cellStates.DYING:
                        nextState = cellStates.DEAD;
                        break;
                }
                if (nextState !== currentState) changed = true;
                nextGrid[y][x] = nextState;
            }
        }
        const gridsIdentical = areGridsIdentical(grid, nextGrid); // Check before assigning
        grid = nextGrid;
        return !gridsIdentical; // Return true if the grid changed
    }

    function renderGrid() {
        let gridString = "";
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                gridString += cellChars[grid[y][x]];
            }
            gridString += '\n';
        }
        if (gridString !== lastRenderedGridString) {
            gridContainer.textContent = gridString;
            lastRenderedGridString = gridString;
        }
    }

    function calculateScore() {
        let score = 0;
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                if (grid[y][x] === cellStates.STABLE) {
                    score += 1; // 1 point per stable cell
                } else if (grid[y][x] === cellStates.NEW) {
                    score += 0.5; // Half point for new cells?
                }
            }
        }
        return Math.floor(score); // Return integer score
    }

    function updateGenerationDisplay() {
        if (generationDisplay) {
             generationDisplay.textContent = `Generation: ${currentGeneration}`;
        }
    }

    // --- Game Loop (Instance-based) --- //

    function runInstanceStep() {
        if (!isRunningInstance) return; // Should not happen if interval is cleared properly

        const changed = updateGrid();
        renderGrid();
        currentGeneration++;
        updateGenerationDisplay();

        if (!changed || currentGeneration >= maxGenerationsPerRun) {
            // Instance finished (stable or max generations reached)
            finishInstance();
        } else {
            // Schedule next step
            intervalId = setTimeout(runInstanceStep, runStepDelay);
        }
    }

    function startInstance() {
        if (isRunningInstance) return; // Don't start if already running

        isRunningInstance = true;
        runButton.disabled = true; // Disable button during run
        runButton.textContent = 'Running...';
        randomizeGrid(); // Start with a new random pattern

        // Start the simulation steps
        intervalId = setTimeout(runInstanceStep, runStepDelay);
    }

    function finishInstance() {
        if (intervalId) clearTimeout(intervalId);
        intervalId = null;
        isRunningInstance = false;

        const score = calculateScore();
        playerCurrency += score;
        console.log(`Instance finished. Score: ${score}, Total Currency: ${playerCurrency}`);
        updateCurrencyDisplay();
        saveGame();

        runButton.disabled = false; // Re-enable button
        runButton.textContent = 'Start New Run';
        // Optionally clear the grid visually after scoring, or leave it
        // grid = createGrid(gridWidth, gridHeight); renderGrid();
    }

    // --- Event Listeners --- //

    runButton.addEventListener('click', startInstance);

    // Remove speed slider logic
    // speedSlider.addEventListener(...);

    // --- Initial Setup --- //
    loadGame(); // Load currency
    renderGrid(); // Initial render (likely empty)
    runButton.textContent = 'Start New Run'; // Set initial button text
    updateGenerationDisplay(); // Set initial generation text
}); 