document.addEventListener('DOMContentLoaded', () => {
    const gridContainer = document.getElementById('grid-container');
    const runButton = document.getElementById('run-instance'); // Renamed from start-pause
    // const randomizeButton = document.getElementById('randomize'); // Can remove or repurpose later
    const currencyDisplay = document.getElementById('currency-display');
    const generationDisplay = document.getElementById('generation-display'); // Optional: show generation count
    const runLogContainer = document.getElementById('run-log'); // Get log container

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
    let previousGrid = createGrid(gridWidth, gridHeight); // Store state from t-1 for oscillator detection
    let isRunningInstance = false;
    let intervalId = null;
    let lastRenderedGridString = "";
    let currentGeneration = 0;
    // State for heuristic oscillator detection
    let consecutiveLowChangeSteps = 0;
    const lowChangeThreshold = 4; // Consider low change if <= this many cells change
    const lowChangeStepsRequired = 5; // For this many consecutive steps
    const oscillatorIncomePerStep = 1; // Use whole number for passive income

    // State Flags
    let isOscillatorActive = false;

    // Game Data Object (for persistence)
    let gameData = {
        playerCurrency: 0,
        runCount: 0, // Track number of runs completed
        upgrades: {
            density: 0, // Level of density upgrade
            multiplier: 0 // Level of multiplier upgrade
        }
    };

    // Upgrade Configuration
    const upgradesConfig = {
        density: {
            baseCost: 10,
            costExponent: 1.5,
            baseValue: 0.25, // Start at 25% density
            increment: 0.02 // Increase by 2% per level
        },
        multiplier: {
            baseCost: 25,
            costFactor: 1.2, // Exponential cost increase
            baseValue: 1, // Start at 1x multiplier
            increment: 0.1 // Increase by 0.1x per level
        }
    };

    // --- Persistence --- //
    function loadGame() {
        const savedData = localStorage.getItem('asciiLifeIncremental');
        if (savedData) {
            gameData = JSON.parse(savedData);
            // Basic validation/migration
            if (!gameData.upgrades) {
                gameData.upgrades = { density: 0, multiplier: 0 };
            }
             if (gameData.runCount === undefined) { // Add runCount if missing from old save
                 gameData.runCount = 0;
             }
        } else {
            // Initialize if no save data exists
             gameData = {
                playerCurrency: 0,
                runCount: 0,
                upgrades: { density: 0, multiplier: 0 }
            };
        }
        updateCurrencyDisplay();
        updateAllUpgradeDisplays();
    }

    function saveGame() {
        localStorage.setItem('asciiLifeIncremental', JSON.stringify(gameData));
    }

    function updateCurrencyDisplay() {
        currencyDisplay.textContent = `Currency: ${gameData.playerCurrency}`;
    }

    // --- Upgrade Calculations --- //
    function getUpgradeCost(upgradeName) {
        const config = upgradesConfig[upgradeName];
        const level = gameData.upgrades[upgradeName];
        if (config.costExponent) {
            return Math.floor(config.baseCost * Math.pow(level + 1, config.costExponent));
        }
        if (config.costFactor) {
            return Math.floor(config.baseCost * Math.pow(config.costFactor, level));
        }
        return config.baseCost * (level + 1); // Default linear if others aren't set
    }

    function getUpgradeEffect(upgradeName) {
        const config = upgradesConfig[upgradeName];
        const level = gameData.upgrades[upgradeName];
        return config.baseValue + level * config.increment;
    }

    // --- Core Logic (Modified for Upgrades) --- //

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
        const currentDensity = getUpgradeEffect('density');
        console.log(`Randomizing grid with density: ${currentDensity.toFixed(2)}`);
        grid = grid.map(row => row.map(() => (Math.random() < currentDensity ? cellStates.NEW : cellStates.DEAD)));
        previousGrid = createGrid(gridWidth, gridHeight);
        consecutiveLowChangeSteps = 0; // Reset heuristic counter
        lastRenderedGridString = "";
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
        previousGrid = grid.map(row => [...row]);
        const nextGrid = createGrid(gridWidth, gridHeight);
        let changedCellCount = 0;
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
                if (nextState !== currentState) {
                    changedCellCount++;
                }
                nextGrid[y][x] = nextState;
            }
        }
        grid = nextGrid;
        return changedCellCount; // Return the number of cells that changed
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
        const currentMultiplier = getUpgradeEffect('multiplier');
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                if (grid[y][x] === cellStates.STABLE) {
                    score += 1;
                } else if (grid[y][x] === cellStates.NEW) {
                    score += 0.5;
                }
            }
        }
        const finalScore = Math.floor(score * currentMultiplier);
        console.log(`Raw Score: ${score.toFixed(1)}, Multiplier: ${currentMultiplier.toFixed(1)}, Final Score: ${finalScore}`);
        return finalScore;
    }

    function updateGenerationDisplay() {
        if (generationDisplay) {
             generationDisplay.textContent = `Generation: ${currentGeneration}`;
        }
    }

    // --- Log Logic --- //
    const maxLogEntries = 20;

    // Simplified log entry - bonus is now passive income
    function addLogEntry(runNumber, generation, currencyGained, finishReason) {
        if (!runLogContainer) return;
        const logMessage = `Run ${runNumber}: ${generation} gens, +${currencyGained} currency (${finishReason})`;
        const newEntry = document.createElement('p');
        newEntry.textContent = logMessage;
        runLogContainer.insertBefore(newEntry, runLogContainer.firstChild);
        while (runLogContainer.childNodes.length > maxLogEntries) {
            runLogContainer.removeChild(runLogContainer.lastChild);
        }
    }

    // --- Game Loop (Instance-based) --- //

    function runInstanceStep() {
        if (!isRunningInstance) return;

        const changedCellCount = updateGrid();
        renderGrid();
        currentGeneration++;
        updateGenerationDisplay();

        const isPeriod2Oscillator = areGridsIdentical(grid, previousGrid);
        let finishReason = null;
        let currentlyOscillating = false;

        // --- Check for Oscillator States --- //
        if (isPeriod2Oscillator) {
            currentlyOscillating = true;
        } else if (changedCellCount > 0 && changedCellCount <= lowChangeThreshold) {
            consecutiveLowChangeSteps++;
            if (consecutiveLowChangeSteps >= lowChangeStepsRequired) {
                currentlyOscillating = true; // Heuristic detected
            }
        } else {
            // If change is significant or zero, reset low change counter
            consecutiveLowChangeSteps = 0;
        }

        // --- Handle Oscillator State Change & Passive Income --- //
        if (currentlyOscillating) {
            if (!isOscillatorActive) {
                isOscillatorActive = true;
                console.log("Oscillator state active - passive income started.");
                gridContainer.style.borderColor = '#FF0'; // Yellow border for active oscillator
            }
            // Add passive income
            gameData.playerCurrency += oscillatorIncomePerStep;
            updateCurrencyDisplay(); // Update display frequently during passive income

        } else {
            if (isOscillatorActive) {
                isOscillatorActive = false;
                console.log("Oscillator state broken - passive income stopped.");
                gridContainer.style.borderColor = '#AAA'; // Reset border color
            }
        }

        // --- Check for Run End Conditions --- //
        if (changedCellCount === 0) {
            finishReason = "Stable (P1)";
        } else if (currentGeneration >= maxGenerationsPerRun) {
            finishReason = "Max Generations Reached";
        }
        // NOTE: We no longer finish immediately for P2 or low change

        if (finishReason) {
            console.log(`Finishing instance: ${finishReason}`);
            finishInstance(finishReason);
        } else {
            intervalId = setTimeout(runInstanceStep, runStepDelay);
        }
    }

    function startInstance() {
        if (isRunningInstance) return;
        gameData.runCount++;
        isRunningInstance = true;
        isOscillatorActive = false; // Reset flag
        consecutiveLowChangeSteps = 0; // Reset counter
        runButton.disabled = true;
        endRunButton.disabled = false; // Enable manual end button
        runButton.textContent = 'Running...';
        gridContainer.style.borderColor = '#AAA'; // Ensure border is reset
        randomizeGrid();
        intervalId = setTimeout(runInstanceStep, runStepDelay);
    }

    // Simplified finishInstance - no bonus multiplier
    function finishInstance(finishReason = "Manual Stop", lastChangedCount = 0) {
        if (!isRunningInstance) return; // Prevent double calls if button clicked right at natural end

        if (intervalId) clearTimeout(intervalId);
        intervalId = null;
        isRunningInstance = false;
        isOscillatorActive = false; // Ensure flag is off

        let score = calculateScore(); // Calculate final score from grid state
        const generationFinished = currentGeneration;

        addLogEntry(gameData.runCount, generationFinished, score, finishReason);

        // Passive income was already added during the run
        // We just need to ensure the final state is saved
        console.log(`Instance finished. Run: ${gameData.runCount}, Gens: ${generationFinished}, Final Grid Score: ${score}, Reason: ${finishReason}, Total Currency: ${gameData.playerCurrency}`);
        updateCurrencyDisplay(); // Ensure final currency is shown
        updateAllUpgradeDisplays();
        gridContainer.style.borderColor = '#AAA'; // Reset border
        saveGame();

        runButton.disabled = false;
        endRunButton.disabled = true; // Disable manual end button
        runButton.textContent = 'Start New Run';
    }

    // --- Manual End Button Logic --- //
    const endRunButton = document.getElementById('end-run');
    if(endRunButton) { // Check if button exists
         endRunButton.addEventListener('click', () => {
            if (isRunningInstance) {
                 console.log("Manual end run requested.");
                 finishInstance("Manual Stop");
             }
         });
         endRunButton.disabled = true; // Initially disabled
     }

    // --- Upgrade UI & Logic --- //

    function updateUpgradeDisplay(upgradeName) {
        const level = gameData.upgrades[upgradeName];
        const effect = getUpgradeEffect(upgradeName);
        const cost = getUpgradeCost(upgradeName);
        const canAfford = gameData.playerCurrency >= cost;

        const effectDisplay = document.getElementById(`${upgradeName}-effect`);
        const costDisplay = document.getElementById(`${upgradeName}-cost`);
        const buyButton = document.getElementById(`buy-${upgradeName}`);

        if (!effectDisplay || !costDisplay || !buyButton) return; // Elements might not exist yet

        // Update display based on upgrade type
        let effectText = "";
        if (upgradeName === 'density') {
            effectText = `Density: ${(effect * 100).toFixed(0)}% (Lvl ${level})`;
        } else if (upgradeName === 'multiplier') {
            effectText = `Multiplier: ${effect.toFixed(1)}x (Lvl ${level})`;
        }
        effectDisplay.textContent = effectText;
        costDisplay.textContent = `Cost: ${cost}`;
        buyButton.disabled = !canAfford;
    }

    function updateAllUpgradeDisplays() {
        updateUpgradeDisplay('density');
        updateUpgradeDisplay('multiplier');
    }

    function buyUpgrade(upgradeName) {
        const cost = getUpgradeCost(upgradeName);
        if (gameData.playerCurrency >= cost) {
            gameData.playerCurrency -= cost;
            gameData.upgrades[upgradeName]++;
            console.log(`Bought upgrade: ${upgradeName}, Level: ${gameData.upgrades[upgradeName]}`);
            updateCurrencyDisplay();
            updateAllUpgradeDisplays();
            saveGame();
        } else {
            console.log(`Cannot afford upgrade: ${upgradeName}`);
        }
    }

    // --- Tapping Interaction --- //
    function getCellCoordsFromEvent(event) {
        const rect = gridContainer.getBoundingClientRect();
        // Determine if it's a touch event or mouse event
        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;

        const relativeX = clientX - rect.left;
        const relativeY = clientY - rect.top;

        // Estimate character dimensions (might need refinement depending on font/styling)
        // Using scrollWidth/Height accounts for potential discrepancies with clientWidth/Height
        const charWidth = gridContainer.scrollWidth / gridWidth;
        const charHeight = gridContainer.scrollHeight / gridHeight;

        const gridX = Math.floor(relativeX / charWidth);
        const gridY = Math.floor(relativeY / charHeight);

        // Check bounds
        if (gridX >= 0 && gridX < gridWidth && gridY >= 0 && gridY < gridHeight) {
            return { x: gridX, y: gridY };
        }
        return null; // Click was outside the grid bounds
    }

    function handleGridTap(event) {
        if (!isRunningInstance) return;

        const coords = getCellCoordsFromEvent(event);
        if (coords) {
            console.log(`Tapped wave at: ${coords.x}, ${coords.y}`);

            // Create a 2x2 'wave' pattern of NEW cells
            const cellsToChange = [
                { x: coords.x, y: coords.y },
                { x: coords.x + 1, y: coords.y },
                { x: coords.x, y: coords.y + 1 },
                { x: coords.x + 1, y: coords.y + 1 }
            ];

            let waveRenderNeeded = false;
            cellsToChange.forEach(cell => {
                // Wrap coordinates around the grid edges
                const wrappedX = (cell.x + gridWidth) % gridWidth;
                const wrappedY = (cell.y + gridHeight) % gridHeight;

                // Only change if not already NEW, and mark for re-render
                if (grid[wrappedY][wrappedX] !== cellStates.NEW) {
                     grid[wrappedY][wrappedX] = cellStates.NEW;
                     waveRenderNeeded = true;
                }
            });

            if (waveRenderNeeded) {
                renderGrid(); // Immediately render the wave pattern
            }
             // Optional: Add a small cost or limit taps per run later?
        }
    }

    // --- Event Listeners --- //

    runButton.addEventListener('click', startInstance);
    gridContainer.addEventListener('click', handleGridTap);
    // Add touch event listener for mobile compatibility
    gridContainer.addEventListener('touchstart', handleGridTap, { passive: true });

    // Add listeners for buy buttons
    document.getElementById('buy-density')?.addEventListener('click', () => buyUpgrade('density'));
    document.getElementById('buy-multiplier')?.addEventListener('click', () => buyUpgrade('multiplier'));

    // --- Initial Setup --- //
    loadGame();
    renderGrid();
    runButton.textContent = 'Start New Run';
    updateGenerationDisplay();
    updateAllUpgradeDisplays(); // Initial UI setup for upgrades
}); 