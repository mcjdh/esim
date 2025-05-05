document.addEventListener('DOMContentLoaded', () => {
    const gridContainer = document.getElementById('grid-container');
    const runButton = document.getElementById('run-instance'); // Renamed from start-pause
    // const randomizeButton = document.getElementById('randomize'); // Can remove or repurpose later
    const currencyDisplay = document.getElementById('currency-display');
    const generationDisplay = document.getElementById('generation-display'); // Optional: show generation count
    const runLogContainer = document.getElementById('run-log'); // Get log container

    // --- Config --- //
    const gridWidth = 80;
    const gridHeight = 40;
    // const maxGenerationsPerRun = 500; // Safety limit - REMOVED
    const runStepDelay = 50; // ms delay between steps for visualization, 0 for max speed
    const baseRunStepDelay = 50; // Keep original base delay

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
    let baseOscillatorIncomePerStep = 2; // Base income before upgrades - REPURPOSED/REMOVED
    let basePatternBonus = 0; // New: Base additive bonus for pattern reward upgrade

    // --- Pattern Definitions --- //
    // Patterns are defined as arrays of [y, x] offsets from the tap point
    const patterns = {
        'single': [[0, 0]], // Default: Place a single NEW cell
        'block_2x2': [ // Previous default behavior
            [0, 0], [0, 1],
            [1, 0], [1, 1]
        ],
        'blinker_h': [ // Horizontal Blinker (Period 2) - Stable on S23
            [0, -1], [0, 0], [0, 1]
        ],
        'glider_se': [ // Glider moving South-East
            [-1, 0], [0, 1], [1, -1], [1, 0], [1, 1]
        ],
        'toad': [ // Toad oscillator (Period 2)
            [0, 0], [0, 1], [0, 2],
            [1, -1], [1, 0], [1, 1]
        ]
        // Add more patterns here later
    };

    // Base costs for placing stamps
    const stampBaseCosts = {
        'single': 1,
        'blinker_h': 5,
        'glider_se': 10,
        'toad': 8
        // Add costs for future stamps here
    };

    // State Flags
    let isOscillatorActive = false;
    let currentSelectedStamp = 'single'; // Start with single cell placement

    // Game Data Object (for persistence)
    let gameData = {
        playerCurrency: 0,
        runCount: 0, // Track number of runs completed
        upgrades: {
            density: 0, // Level of density upgrade
            multiplier: 0, // Level of multiplier upgrade
            gliderLongevity: 0, // NEW
            blinkerStability: 0, // NEW
            stampEfficiency: 0, // NEW
            runSpeed: 0, // NEW
            oscillatorIncome: 0 // NEW
        }
    };

    // Initialize new upgrades in gameData if loading old save data
    if (!gameData.upgrades.gliderLongevity) gameData.upgrades.gliderLongevity = 0;
    if (!gameData.upgrades.blinkerStability) gameData.upgrades.blinkerStability = 0;
    if (!gameData.upgrades.stampEfficiency) gameData.upgrades.stampEfficiency = 0; // NEW
    if (!gameData.upgrades.runSpeed) gameData.upgrades.runSpeed = 0; // NEW
    if (!gameData.upgrades.oscillatorIncome) gameData.upgrades.oscillatorIncome = 0; // NEW

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
        },
        gliderLongevity: { // NEW
            baseCost: 50,
            costFactor: 1.6, // Reduced from 1.8
            baseValue: 0, // Start at 0% bonus chance/effect
            increment: 0.015 // Slightly increased from 0.01
        },
        blinkerStability: { // NEW
            baseCost: 30,
            costFactor: 1.5, // Reduced from 1.6
            baseValue: 0, // Start at 0% bonus chance/effect
            increment: 0.02 // Slightly increased from 0.015
        },
        stampEfficiency: { // NEW
            baseCost: 40,
            costFactor: 1.7,
            baseValue: 0, // Start at 0% cost reduction
            increment: 0.05, // 5% cost reduction per level
            maxValue: 0.9 // Cap at 90% reduction
        },
        runSpeed: { // NEW
            baseCost: 75,
            costFactor: 1.8,
            baseValue: 1, // Multiplier for speed (higher is faster, relates to delay reduction)
            increment: 0.15, // Increase speed multiplier by 0.15x per level
            effectFormula: (level, baseVal, increment) => baseRunStepDelay / (baseVal + level * increment), // Calculates actual delay
            minDelay: 5 // Minimum delay in ms
        },
        oscillatorIncome: { // REPURPOSED to Pattern Bonus
            baseCost: 100,
            costFactor: 1.9, // Increased from 1.7
            baseValue: basePatternBonus, // Start at +0 bonus
            increment: 1 // Increase bonus reward by +1 per level per pattern instance
        }
    };

    // --- Persistence --- //
    function loadGame() {
        // const savedData = localStorage.getItem('asciiLifeIncremental'); // Commented out
        // if (savedData) { // Commented out
            // gameData = JSON.parse(savedData); // Commented out
            // Basic validation/migration
            // if (!gameData.upgrades) { // Commented out
            //     gameData.upgrades = { density: 0, multiplier: 0 }; // Commented out
            // } // Commented out
            //  if (gameData.runCount === undefined) { // Commented out
            //      gameData.runCount = 0; // Commented out
            //  } // Commented out
        // } else { // Commented out - Always initialize now
            // Initialize if no save data exists
             gameData = {
                playerCurrency: 0,
                runCount: 0,
                upgrades: {
                    density: 0,
                    multiplier: 0,
                    gliderLongevity: 0,
                    blinkerStability: 0,
                    stampEfficiency: 0, // NEW
                    runSpeed: 0, // NEW
                    oscillatorIncome: 0 // NEW
                 }
            };
        // } // Commented out
        updateCurrencyDisplay();
        updateAllUpgradeDisplays();
    }

    function saveGame() {
        // localStorage.setItem('asciiLifeIncremental', JSON.stringify(gameData)); // Commented out
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
        let effect = config.baseValue + level * config.increment;

        // Apply max value cap if defined
        if (config.maxValue !== undefined) {
            effect = Math.min(effect, config.maxValue);
        }

        return effect;
    }

    // --- Helper Functions --- //
    function isGridEmpty() {
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                if (grid[y][x] !== cellStates.DEAD) {
                    return false; // Found a non-dead cell
                }
            }
        }
        return true; // No non-dead cells found
    }

    // --- Pattern Definitions & Detection --- //

    // Define patterns by relative coordinates [y, x] of STABLE cells
    // from the top-left of their bounding box.
    const knownPatterns = {
        beehive: {
            name: "Beehive",
            reward: 10, // Currency reward per instance
            size: { h: 3, w: 4 },
            cells: [
                [0, 1], [0, 2],
                [1, 0], [1, 3],
                [2, 1], [2, 2]
            ]
        },
        block: {
            name: "Block",
            reward: 3, // Smaller reward for simpler pattern
            size: { h: 2, w: 2 },
            cells: [
                [0, 0], [0, 1],
                [1, 0], [1, 1]
            ]
        },
        blinker_h_stable: { // Detect horizontal blinker only in its stable phase (# # #)
            name: "Blinker (H)",
            reward: 1, // Reduced from 2
            size: { h: 1, w: 3 },
            cells: [
                [0, 0], [0, 1], [0, 2]
            ]
        },
        toad_stable: { // Detect Toad in one of its stable phases
            name: "Toad",
            reward: 3, // Reduced from 6
            size: { h: 2, w: 4 }, // Bounding box
            cells: [
                // Phase 1:    Phase 2:
                //  ###         . # .
                // ###          # #
                // We detect phase 1 here
                 [0, 1], [0, 2], [0, 3],
                 [1, 0], [1, 1], [1, 2]
            ]
        }
        // Add more patterns here later
    };

    function detectPatterns(targetGrid) {
        const detectedCounts = {};
        for (const key in knownPatterns) {
            detectedCounts[key] = 0;
        }

        const checked = Array.from({ length: gridHeight }, () => Array(gridWidth).fill(false));

        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                if (checked[y][x]) continue; // Skip if already part of a detected pattern

                // Only STABLE cells can potentially start a stable pattern
                if (targetGrid[y][x] !== cellStates.STABLE) continue;

                for (const patternKey in knownPatterns) {
                    const pattern = knownPatterns[patternKey];
                    const { h, w } = pattern.size;

                    // Check if pattern fits within grid boundaries from current (y, x)
                    // We only need to check bottom-right corner effectively
                    if (y + h > gridHeight || x + w > gridWidth) continue;

                    let isMatch = true;
                    const matchedCells = []; // Keep track of cells forming this potential match

                    // Check all cells within the bounding box
                    for (let dy = 0; dy < h; dy++) {
                        for (let dx = 0; dx < w; dx++) {
                            const currentY = y + dy;
                            const currentX = x + dx;
                            const isPatternCell = pattern.cells.some(cell => cell[0] === dy && cell[1] === dx);
                            const cellState = targetGrid[currentY][currentX];

                            // Check if cell state matches requirement (STABLE if part of pattern, DEAD otherwise)
                            if (isPatternCell) {
                                if (cellState !== cellStates.STABLE || checked[currentY][currentX]) {
                                    isMatch = false;
                                    break;
                                }
                                matchedCells.push({ y: currentY, x: currentX });
                            } else {
                                // Optional: Stronger check - require non-pattern cells in bounds to be DEAD
                                // if (cellState !== cellStates.DEAD) {
                                //    isMatch = false;
                                //    break;
                                // }
                            }
                        }
                        if (!isMatch) break;
                    }

                    if (isMatch) {
                        detectedCounts[patternKey]++;
                        // Mark all cells of the found pattern as checked
                        matchedCells.forEach(cell => {
                            checked[cell.y][cell.x] = true;
                        });
                        // Found a pattern starting at (y,x), no need to check other patterns for this cell
                        break; // Go to next grid cell (y, x+1)
                    }
                }
            }
        }
        return detectedCounts;
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
        const nextGrid = createGrid(gridWidth, gridHeight); // Create a new grid for the next state
        let changedCellsCount = 0;
        let liveCellCount = 0;
        let newCellCount = 0;
        let stableCellCount = 0;
        let dyingCellCount = 0;

        // Get current upgrade effects
        const blinkerStabilityEffect = getUpgradeEffect('blinkerStability'); // Chance to survive overpopulation specifically for STABLE cells
        const gliderLongevityEffect = getUpgradeEffect('gliderLongevity'); // General chance to survive overpopulation for any LIVE cell

        // NOTE: Removed the direct modification of overpopulationThreshold here

        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                const neighbors = getNeighborCount(x, y);
                const currentState = grid[y][x];
                let nextState = cellStates.DEAD; // Determine next state based on rules, default to DEAD

                // --- Apply standard B3/S23 rules first ---
                if (currentState === cellStates.DEAD || currentState === cellStates.DYING) {
                    // Rule B3: A dead cell with exactly 3 live neighbours becomes a live cell (NEW).
                    if (neighbors === 3) {
                        nextState = cellStates.NEW;
                    } else {
                        nextState = cellStates.DEAD; // Remains DEAD
                    }
                } else { // Cell is LIVE (NEW or STABLE)
                    // Rule S23: A live cell with 2 or 3 live neighbours survives (becomes STABLE).
                    if (neighbors === 2 || neighbors === 3) {
                        nextState = cellStates.STABLE;
                    } else {
                        // Rule U/O: A live cell with fewer than 2 (<2) or more than 3 (>3) live neighbours dies.
                        // We'll initially set it to DYING, then check for upgrade saves.
                        nextState = cellStates.DYING;
                    }
                }

                // --- Apply Upgrades as modifiers for Overpopulation ---
                // Check if the cell was LIVE and the standard rules decided it should die due to overpopulation (>3 neighbors)
                if ((currentState === cellStates.NEW || currentState === cellStates.STABLE) && neighbors > 3 && nextState === cellStates.DYING) {
                    // Glider Longevity: General chance for any LIVE cell to survive overpopulation
                    if (Math.random() < gliderLongevityEffect) {
                        nextState = cellStates.STABLE; // Saved by Longevity!
                    }
                    // Blinker Stability: Additional chance specifically for STABLE cells to survive overpopulation
                    // This check happens only if Longevity save failed.
                    else if (currentState === cellStates.STABLE && Math.random() < blinkerStabilityEffect) {
                        nextState = cellStates.STABLE; // Saved by Stability!
                    }
                    // If neither save occurred, it remains DYING as determined by base rules.
                }

                // --- Optional: Apply Underpopulation save (Alternative Blinker Stability idea) ---
                // If a STABLE cell died due to underpopulation (<2 neighbors)
                /*
                if (currentState === cellStates.STABLE && neighbors < 2 && nextState === cellStates.DYING) {
                    if (Math.random() < blinkerStabilityEffect) {
                        nextState = cellStates.STABLE; // Saved from isolation!
                    }
                }
                */

                // Update counts and grid state
                nextGrid[y][x] = nextState;
                if (nextState !== currentState) {
                    changedCellsCount++;
                }
                if (nextState !== cellStates.DEAD) {
                    liveCellCount++;
                    if (nextState === cellStates.NEW) newCellCount++;
                    else if (nextState === cellStates.STABLE) stableCellCount++;
                    else if (nextState === cellStates.DYING) dyingCellCount++;
                }
            }
        }

        // Update main grid and previous grid
        previousGrid = grid; // Keep track of the last state for oscillation detection
        grid = nextGrid;

        // Return necessary info
        return { changedCellsCount, liveCellCount, newCellCount, stableCellCount, dyingCellCount };
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

    // Modified log entry function
    function addLogEntry(runNumber, generation, currencyGained, finishReason, details = "") {
        if (!runLogContainer) return;
        let logMessage = `Run ${runNumber}: ${generation} gens, +${currencyGained} currency (${finishReason})`;
        if (details) {
            logMessage += ` [${details}]`;
        }
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

        const { changedCellsCount, liveCellCount, newCellCount, stableCellCount, dyingCellCount } = updateGrid();
        renderGrid();
        currentGeneration++;
        updateGenerationDisplay();

        // --- Calculate and Add Per-Step Reward --- //
        const stepCurrency = calculateStepReward(grid);
        if (stepCurrency > 0) {
            const previousCurrency = gameData.playerCurrency;
            gameData.playerCurrency += stepCurrency;
            updateCurrencyDisplay();
            updateAllUpgradeDisplays(); // Re-check affordability based on new currency
            console.log(`+${stepCurrency} currency this step. Old: ${previousCurrency}, New: ${gameData.playerCurrency}`);
        }
        // ---------------------------------------- //

        const isPeriod2Oscillator = areGridsIdentical(grid, previousGrid);
        let finishReason = null;
        let currentlyOscillating = false;

        // --- Check for Oscillator States --- //
        if (isPeriod2Oscillator) {
            currentlyOscillating = true;
        } else if (changedCellsCount > 0 && changedCellsCount <= lowChangeThreshold) {
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
            const currentOscillatorIncome = getCurrentOscillatorIncome();
            gameData.playerCurrency += currentOscillatorIncome;
            updateCurrencyDisplay(); // Update display frequently during passive income
            updateAllUpgradeDisplays(); // Re-check affordability

        } else {
            if (isOscillatorActive) {
                isOscillatorActive = false;
                console.log("Oscillator state broken."); // Removed passive income message
                gridContainer.style.borderColor = '#AAA'; // Reset border color
            }
        }

        // --- Check for Run End Conditions --- //
        if (changedCellsCount === 0) {
            finishReason = "Stable (P1)";
        }
        // NOTE: We no longer finish immediately for P2 or low change

        if (finishReason) {
            console.log(`Finishing instance: ${finishReason}`);
            finishInstance(finishReason);
        } else {
            intervalId = setTimeout(runInstanceStep, getCurrentRunStepDelay()); // Use dynamic delay
        }
    }

    function startInstance() {
        if (isRunningInstance) return;
        gameData.runCount++;
        isRunningInstance = true;
        isOscillatorActive = false; // Reset flag
        consecutiveLowChangeSteps = 0; // Reset counter
        currentGeneration = 0; // Reset generation counter here
        runButton.disabled = true;
        endRunButton.disabled = false; // Enable manual end button
        // document.getElementById('clear-grid').disabled = true; // No longer disable clear during run
        runButton.textContent = 'Running...';
        gridContainer.style.borderColor = '#AAA'; // Ensure border is reset

        // --- Conditional Randomization --- //
        // if (isGridEmpty()) {
        //     console.log("Grid is empty, randomizing for new run.");
        randomizeGrid(); // Always randomize grid now
        // } else {
        //     console.log("Starting run with existing pattern(s).");
        //     // Ensure previousGrid matches the user-placed pattern for P2 detection
        //     previousGrid = grid.map(row => [...row]);
        //     lastRenderedGridString = ""; // Force re-render
        //     renderGrid(); // Display the initial state correctly
        // }
        updateGenerationDisplay(); // Update display after potential randomize/render

        intervalId = setTimeout(runInstanceStep, getCurrentRunStepDelay()); // Use dynamic delay for first step too
    }

    // Simplified finishInstance - no bonus multiplier
    function finishInstance(finishReason = "Manual Stop", lastChangedCount = 0) {
        if (!isRunningInstance) return; // Should not happen, but safety check
        isRunningInstance = false;
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        runButton.textContent = "Start New Run";
        runButton.disabled = false;
        endRunButton.disabled = true; // Disable end run button until next run starts
        document.getElementById('clear-grid').disabled = false; // Re-enable clear button

        let finalScore = 0; // Kept variable name, but represents total accumulated
        const currencyGained = gameData.playerCurrency - previousCurrency; // Calculate total gained over the run

        // --- Pattern Detection & Scoring REMOVED --- //
        // const detectedPatterns = detectPatterns(grid); // REMOVED
        // let patternBonus = 0; // REMOVED
        // let patternLogString = "Patterns: "; // REMOVED
        // let patternsFound = false; // REMOVED
        // ... loop removed ...
        // if (!patternsFound) patternLogString = "Patterns: None"; // REMOVED

        // --- Longevity Bonus REMOVED --- //
        // const longevityThreshold = 100; // REMOVED
        // const longevityBonusFactor = 0.1; // REMOVED
        // let longevityBonus = 0; // REMOVED
        // let longevityLogString = ""; // REMOVED
        // ... if blocks removed ...

        // Currency is already updated step-by-step
        const finalTotalCurrency = gameData.playerCurrency;
        // Add log entry with simplified info
        addLogEntry(gameData.runCount, currentGeneration, currencyGained, finishReason, `End Currency: ${finalTotalCurrency}`);

        updateCurrencyDisplay();
        // saveGame(); // Commented out
        console.log(`Instance finished: ${finishReason}. Generations: ${currentGeneration}. Currency Gained: ${currencyGained}. Final Total: ${finalTotalCurrency}. Run: ${gameData.runCount}`);

        // Enable the start button again, maybe after a short delay or immediately
        document.getElementById('end-run').style.display = 'none'; // Hide End Run button
        document.getElementById('run-instance').style.display = 'inline-block'; // Show Start Run button

        isOscillatorActive = false; // Reset oscillator flag after run ends

        renderGrid();
        console.log("Grid cleared.");
        // Ensure buttons are in the correct state after clearing
        runButton.disabled = false;
        endRunButton.disabled = true;
        document.getElementById('clear-grid').disabled = false; // Clear button is never disabled
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
        } else if (upgradeName === 'gliderLongevity') {
            effectText = `Glider Longevity: ${effect.toFixed(2)}% (Lvl ${level})`;
        } else if (upgradeName === 'blinkerStability') {
            effectText = `Blinker Stability: ${effect.toFixed(2)}% (Lvl ${level})`;
        } else if (upgradeName === 'stampEfficiency') {
            effectText = `Stamp Efficiency: ${effect.toFixed(1)}% (Lvl ${level})`;
        } else if (upgradeName === 'runSpeed') {
            const speedMultiplier = config.baseValue + level * config.increment;
            effectText = `Run Speed: ${speedMultiplier.toFixed(2)}x (Lvl ${level})`; // Show multiplier
        } else if (upgradeName === 'oscillatorIncome') {
            effectText = `Pattern Bonus: +${effect} (Lvl ${level})`; // Updated Text
        }
        effectDisplay.textContent = effectText;
        costDisplay.textContent = `Cost: ${cost}`;
        buyButton.disabled = !canAfford;
    }

    function updateAllUpgradeDisplays() {
        updateUpgradeDisplay('density');
        updateUpgradeDisplay('multiplier');
        updateUpgradeDisplay('gliderLongevity');
        updateUpgradeDisplay('blinkerStability');
        updateUpgradeDisplay('stampEfficiency'); // NEW
        updateUpgradeDisplay('runSpeed'); // NEW
        updateUpgradeDisplay('oscillatorIncome'); // NEW
    }

    function buyUpgrade(upgradeName) {
        const cost = getUpgradeCost(upgradeName);
        if (gameData.playerCurrency >= cost) {
            gameData.playerCurrency -= cost;
            gameData.upgrades[upgradeName]++;
            updateCurrencyDisplay();
            updateUpgradeDisplay(upgradeName);
            // saveGame(); // Commented out - No need to save if we don't load
            console.log(`Bought upgrade ${upgradeName}. Level: ${gameData.upgrades[upgradeName]}, Cost: ${cost}`);
            // Update dependent displays if necessary
            if (upgradeName === 'stampEfficiency') {
                updateStampCostDisplay();
            }
            if (upgradeName === 'oscillatorIncome' || upgradeName === 'runSpeed' || upgradeName === 'multiplier') { // Added multiplier
                // No immediate effect needed to update here, handled in run loop/UI display func
            }
        } else {
            console.log(`Not enough currency to buy ${upgradeName}. Need: ${cost}, Have: ${gameData.playerCurrency}`);
            // Optional: visual feedback to player
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
        // Allow tapping even when not running to set up initial state
        // if (isRunningInstance) { // Optional: Only allow tapping during a run?
        //     console.log("Tapping only allowed during runs.");
        //     return;
        // }

        const coords = getCellCoordsFromEvent(event);
        if (coords) {
            const patternOffsets = patterns[currentSelectedStamp];
            const baseCost = stampBaseCosts[currentSelectedStamp] || 0;
            const efficiencyEffect = getUpgradeEffect('stampEfficiency');
            const actualCost = Math.floor(baseCost * (1 - efficiencyEffect));

            if (!patternOffsets) {
                console.error(`Unknown pattern selected: ${currentSelectedStamp}`);
                return;
            }

            // Check if player can afford it
            if (gameData.playerCurrency < actualCost) {
                console.log(`Cannot afford stamp '${currentSelectedStamp}'. Cost: ${actualCost}, Have: ${gameData.playerCurrency}`);
                // Optional: Add visual feedback (e.g., shake button, temporary red text)
                return; // Stop placement
            }

            console.log(`Placing pattern '${currentSelectedStamp}' at: ${coords.x}, ${coords.y}. Cost: ${actualCost}`);

            let patternPlaced = false;
            patternOffsets.forEach(offset => {
                const targetX = coords.x + offset[1];
                const targetY = coords.y + offset[0];

                // Wrap coordinates around the grid edges
                const wrappedX = (targetX + gridWidth) % gridWidth;
                const wrappedY = (targetY + gridHeight) % gridHeight;

                // Place a NEW cell, potentially overwriting existing ones
                // We might later add logic to only place on DEAD cells, or cost currency
                if (grid[wrappedY][wrappedX] !== cellStates.NEW) {
                    grid[wrappedY][wrappedX] = cellStates.NEW;
                    patternPlaced = true;
                }
            });

            if (patternPlaced) {
                // Deduct cost only if something was actually placed
                gameData.playerCurrency -= actualCost;
                updateCurrencyDisplay();
                updateAllUpgradeDisplays(); // Update buttons in case currency drop makes upgrades unaffordable

                renderGrid(); // Immediately render the placed pattern
                 // Reset oscillator detection flags if the grid was changed by tapping
                 isOscillatorActive = false;
                 consecutiveLowChangeSteps = 0;
                 gridContainer.style.borderColor = '#AAA'; // Reset border color
            }
            // Optional: Add a cost or limit taps per run here later
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
    document.getElementById('buy-glider-longevity')?.addEventListener('click', () => buyUpgrade('gliderLongevity')); // NEW
    document.getElementById('buy-blinker-stability')?.addEventListener('click', () => buyUpgrade('blinkerStability')); // NEW
    document.getElementById('buy-stamp-efficiency')?.addEventListener('click', () => buyUpgrade('stampEfficiency')); // NEW
    document.getElementById('buy-run-speed')?.addEventListener('click', () => buyUpgrade('runSpeed')); // NEW
    document.getElementById('buy-oscillator-income')?.addEventListener('click', () => buyUpgrade('oscillatorIncome')); // NEW
    // document.getElementById('clear-grid')?.addEventListener('click', clearGrid); // Removed listener

    // Add listeners for stamp selection buttons (IDs defined in HTML)
    document.querySelectorAll('.stamp-button').forEach(button => {
        button.addEventListener('click', (e) => {
            currentSelectedStamp = e.target.getAttribute('data-stamp-id');
            // Optional: Add visual feedback for selected stamp
            document.querySelectorAll('.stamp-button').forEach(btn => btn.classList.remove('selected'));
            e.target.classList.add('selected');
            console.log("Selected stamp:", currentSelectedStamp);
            updateStampCostDisplay(); // Update cost display when stamp changes
        });
    });

    // --- Initial Setup --- //
    loadGame();
    renderGrid();
    runButton.textContent = 'Start New Run';
    updateGenerationDisplay();
    updateAllUpgradeDisplays(); // Initial UI setup for upgrades
    updateStampCostDisplay(); // Initial stamp cost display

    // Initial stamp selection UI update
    const initialStampButton = document.querySelector(`.stamp-button[data-stamp-id="${currentSelectedStamp}"]`);
    if (initialStampButton) {
        initialStampButton.classList.add('selected');
    }

    window.addEventListener('beforeunload', () => {
        // saveGame(); // Save on close/refresh - Commented out
    });

    // --- Helper Functions --- //
    function getCurrentRunStepDelay() {
        const level = gameData.upgrades.runSpeed;
        const config = upgradesConfig.runSpeed;
        const calculatedDelay = config.effectFormula(level, config.baseValue, config.increment);
        return Math.max(config.minDelay, calculatedDelay); // Ensure delay doesn't go below minimum
    }

    function getCurrentOscillatorIncome() {
        return getUpgradeEffect('oscillatorIncome');
    }

    // --- Update Stamp Cost Display --- //
    function updateStampCostDisplay() {
        const costDisplayElement = document.getElementById('current-stamp-cost');
        if (!costDisplayElement) return;

        const patternOffsets = patterns[currentSelectedStamp];
        const baseCost = stampBaseCosts[currentSelectedStamp] || 0;
        const efficiencyEffect = getUpgradeEffect('stampEfficiency');
        const actualCost = Math.floor(baseCost * (1 - efficiencyEffect));

        costDisplayElement.textContent = actualCost;
    }

    // --- NEW: Calculate Reward Per Step --- //
    function calculateStepReward(currentGrid) {
        let stepReward = 0;
        const detectedPatterns = detectPatterns(currentGrid);
        const patternBonus = getUpgradeEffect('oscillatorIncome'); // Get the additive bonus per pattern
        const multiplier = getUpgradeEffect('multiplier');

        for (const key in detectedPatterns) {
            const count = detectedPatterns[key];
            if (count > 0 && knownPatterns[key]) {
                const patternData = knownPatterns[key];
                const baseRewardPerInstance = patternData.reward;
                const bonusPerInstance = patternBonus; // Additive bonus from upgrade
                const totalRewardPerInstance = baseRewardPerInstance + bonusPerInstance;
                stepReward += count * totalRewardPerInstance;
            }
        }

        // Apply global multiplier
        const finalStepReward = Math.floor(stepReward * multiplier);

        if (finalStepReward > 0) {
             console.log(`Step Reward - Detected: ${JSON.stringify(detectedPatterns)}, Base: ${stepReward}, Bonus: +${patternBonus}/pat, Multi: x${multiplier.toFixed(1)}, Final: ${finalStepReward}`);
        }

        return finalStepReward;
    }
}); 