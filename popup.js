const toggleRecordingButton = document.getElementById('toggleRecording');
const clearActionsButton = document.getElementById('clearActions');
const exportCustomActionsButton = document.getElementById('exportCustomActions');
const actionsTableBody = document.getElementById('actionsTable').querySelector('tbody');

// Add/Edit Action Form
const actionDropdown = document.getElementById('actionDropdown');
const locatorInput = document.getElementById('locatorInput');
const valueInput = document.getElementById('valueInput');
const saveButton = document.getElementById('saveAction');
const cancelButton = document.getElementById('cancelEdit');
const editForm = document.getElementById('editForm');

// Action buttons
const addActionButton = document.getElementById('addAction');
const editActionButton = document.getElementById('editAction');
const deleteActionButton = document.getElementById('deleteAction');
const actionButtonsContainer = document.getElementById('actionButtons');

let selectedRows = [];  // To keep track of selected rows
let selectedActionIndex = null; // To keep track of the selected action for editing

// Runs when the extension is open
chrome.storage.local.get(['isRecording'], function(result) {
  const isRecording = result.isRecording || false;
  updateRecordingState(isRecording); // Updates recording state to what is in local storage
  loadActions(); // Load the actions in local storage into the UI
  disableTableClick(isRecording);  // Disable table clicks if recording is happening
  if (isRecording) {
    resetRowSelection(); // If its recording, also reset row selection state
  }
});

// Listen for changes in storage and update actions in real time
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.actions) {
    loadActions();
  }
});

function loadActions() {
  chrome.runtime.sendMessage({ action: 'getActions' }, (response) => {
    actionsTableBody.innerHTML = '';  // Clear the actions table body

    if (response && response.length > 0) {
      response.forEach((action, index) => {
        const row = document.createElement('tr'); // Create a new table row

        // Create Action column
        const actionCell = document.createElement('td');
        actionCell.textContent = action.type;
        row.appendChild(actionCell);

        // Create Web Element Locator column
        const locatorCell = document.createElement('td');
        locatorCell.textContent = action.selector;
        locatorCell.title = action.selector;  // Full value in the title for hover effect
        row.appendChild(locatorCell);

        // Create Value column (only for 'type' and other specific actions with values)
        const valueCell = document.createElement('td');
        if (action.type === 'type' || action.type === 'sendKey' || action.type === 'select option' || action.type === 'Verify Element Text') {
          valueCell.textContent = action.value;
          valueCell.title = action.value;  // Full value in the title for hover effect
        } else if (action.type === 'click' || action.type === 'Verify Element Exists') {
          valueCell.textContent = ''; // No value for click actions or verify element exists
        }
        row.appendChild(valueCell);

        // Append the row to the table
        actionsTableBody.appendChild(row);
      });

      scrollToBottom(); // Scroll the last action into view once loading is complete
    } else {
      actionsTableBody.innerHTML = '<tr><td colspan="3">No actions recorded yet.</td></tr>';
    }

    updateActionButtons();
  });
}


// Scroll to the bottom of the actions table
function scrollToBottom() {
  const actionsContainer = document.getElementById('actions');
  actionsContainer.scrollTop = actionsContainer.scrollHeight;
}

// Update recording state
function updateRecordingState(isRecordingState) {
  toggleRecordingButton.textContent = isRecordingState ? 'Stop Recording' : 'Start Recording';
  chrome.storage.local.set({ isRecording: isRecordingState });
  
  // When recording starts, hide action buttons and the edit UI
  if (isRecordingState) {
    hideActionButtons();
    hideEditForm();
  }
}

// Button to toggle start/stop recording
toggleRecordingButton.addEventListener('click', function() {
  chrome.storage.local.get(['isRecording'], function(result) {
    const isRecording = result.isRecording || false;
    const newState = !isRecording;
    updateRecordingState(newState);
    disableTableClick(newState);  // Update table click state based on recording state
    if (newState) {
      resetRowSelection();  // Remove all selected actions
    }
  });
});

// Clear recorded actions
clearActionsButton.addEventListener('click', function() {
  chrome.storage.local.set({ actions: [] }, function() {
    loadActions();  // Refresh the displayed actions
    console.log('Recorded actions cleared');
  });
});

// ======================= EDIT UI ===========================

// Listen for changes in the Action dropdown
actionDropdown.addEventListener('change', () => {
  const selectedActionType = actionDropdown.value;
  
  // If the action type is 'click', 'Verify Element Exists' or Custom Action, disable the value input
  if (selectedActionType === 'click' || selectedActionType === 'Verify Element Exists' || selectedActionType === 'Custom Action') {
    valueInput.value = '';
    valueInput.disabled = true;
    valueInput.style.backgroundColor = "#f0f0f0"; 
  } else {
    // Enable the value field if the action type is any other action type
    valueInput.disabled = false;
    valueInput.style.backgroundColor = "";
  }
});

// Shift listeners for Shift + Click edit
let isShiftPressed = false;
document.addEventListener('keydown', (event) => {
  if (event.key === 'Shift') {
    isShiftPressed = true;
  }
});
document.addEventListener('keyup', (event) => {
  if (event.key === 'Shift') {
    isShiftPressed = false;
  }
});

function disableTableClick(disable) {
  const table = document.getElementById('actionsTable');
  table.style.pointerEvents = disable ? 'none' : 'auto'; // Disable or enable clicks
}

// Edit the selected action
function editAction(index) {
  hideActionButtons(); // Hide action buttons while the edit form is visible
  selectedActionIndex = index; // Save the selected index
  document.getElementById('formTitle').textContent = 'Edit Action'; // Set form title to "Edit Action"
  disableTableClick(true); // Disable table click

  // Populate the fields with the selected action's details
  chrome.storage.local.get(['actions'], (data) => {
    const actions = data.actions || [];
    const action = actions[selectedActionIndex];
    actionDropdown.value = action.type;
    locatorInput.value = action.selector;
    if (action.type === 'click' || action.type === 'Verify Element Exists') {
      valueInput.value = ''; // Clear value
      valueInput.disabled = true;
      valueInput.style.backgroundColor = "#f0f0f0"; // Grey out
    } else {
      valueInput.value = action.value
      valueInput.disabled = false;
      valueInput.style.backgroundColor = ""; // Enable
    }
  });

  editForm.style.display = 'block'; // Show the edit form
}

// Save the edited action
saveButton.addEventListener('click', () => {
  if (selectedActionIndex !== null) {
    // If the form is in "Add" mode, add the new action on top of the selected action
    if (document.getElementById('formTitle').textContent === 'Add Action') {
      chrome.storage.local.get(['actions'], function(result) {
        let actions = result.actions || [];
        let selectorType = detectSelectorType(locatorInput.value);

        // If "Custom Action" action, store the typed action in the web locator and leave the value empty
        let newAction;
        if (actionDropdown.value === 'Custom Action') {
          newAction = createAction('Custom Action', locatorInput.value, 'css', ''); // The action value is in the locator input
        } else {
          newAction = createAction(actionDropdown.value, locatorInput.value, selectorType, valueInput.value || null);
        }

        actions.splice(selectedActionIndex, 0, newAction);  // Insert at the selected action index
        // Save the updated actions list
        chrome.storage.local.set({ actions: actions });
        loadActions(); // Reload the actions to show the updated values
        hideEditForm(); // Hide the edit form after saving
        resetRowSelection();
        disableTableClick(false); // Re-enable table clicks
      });
    }
    // If the form is in "Edit" mode, edit the selected action
    else if (document.getElementById('formTitle').textContent === 'Edit Action') {
      chrome.storage.local.get(['actions'], (data) => {
        const actions = data.actions || [];
        const action = actions[selectedActionIndex]; // Get the selected action and update it

        // If the action is 'Custom Action', add the action to the locator field
        if (actionDropdown.value === 'Custom Action') {
          action.type = 'Custom Action';
          action.selector = locatorInput.value;  // Store action in the selector field
          action.selectorType = '';
          action.value = '';  // No value for action
        } else {
          action.type = actionDropdown.value;
          action.selector = locatorInput.value;
          action.selectorType = detectSelectorType(locatorInput.value);
          action.value = valueInput.value || action.value;
        }

        // Then update the action in storage
        chrome.storage.local.set({ actions: actions }, () => {
          loadActions(); // Reload the actions to show the updated values
          hideEditForm(); // Hide the edit form after saving
          resetRowSelection();
          disableTableClick(false); // Re-enable table clicks
        });
      });
    }
  }
});

// Cancel editing and close the form
cancelButton.addEventListener('click', () => {
  editForm.style.display = 'none'; // Hide the form without saving
  resetRowSelection(); // Reset row selection
  disableTableClick(false); // Re-enable table clicks
});

// Reset row selection state
function resetRowSelection() {
  selectedRows = []; // Clear selected rows
  const rows = document.querySelectorAll('#actionsTable tbody tr');
  rows.forEach(row => row.classList.remove('selected')); // Remove 'selected' class from all rows
  updateActionButtons(); // Update buttons visibility
  hideActionButtons(); // Hide action buttons
  hideEditForm(); // Hide the edit form
}

// Hide action buttons
function hideActionButtons() {
  actionButtonsContainer.style.display = 'none';
}

// Hide the edit form
function hideEditForm() {
  editForm.style.display = 'none';
}

// ======================= EDIT UI ===========================

// ======================= ADD UI ===========================

// Add button functionality
addActionButton.addEventListener('click', () => {
  addAction(selectedRows[0]);
});

// Edit the selected action
function addAction(index) {
  selectedActionIndex = index; // Save the selected index so that it can be saved later
  loadAddActionForm(); // Change the actions form to the add action UI and display it in the UI
}

// Function to reset the form to the default state for adding an action
function loadAddActionForm() {
  hideActionButtons(); // Hide action buttons while the edit form is visible
  document.getElementById('formTitle').textContent = 'Add Action'; // Set form title to "Add Action"

  // Set Default Values
  actionDropdown.value = 'click';  // Default action is 'click'
  locatorInput.value = '';
  valueInput.value = ''; 
  valueInput.disabled = true;
  valueInput.style.backgroundColor = "#f0f0f0"; 
  editForm.style.display = 'block'; // Show the edit form
  disableTableClick(true); // Disable table click
}

// ======================= ADD UI ===========================

// ======================= ACTION BUTTONS HANDLERS ===========================

// Edit button functionality
editActionButton.addEventListener('click', () => {
  editAction(selectedRows[0]);
});

// Update action
function updateAction() {
  chrome.runtime.sendMessage({ action: 'getActions' }, (response) => {
    actionsTableBody.innerHTML = '';  // Clear the actions table body

    if (response && response.length > 0) {
      response.forEach((action, index) => {
        const row = document.createElement('tr'); // Create a new table row

        // Create Action column
        const actionCell = document.createElement('td');
        actionCell.textContent = action.type;
        row.appendChild(actionCell);

        // Create Web Element Locator column
        const locatorCell = document.createElement('td');
        locatorCell.textContent = action.selector;
        row.appendChild(locatorCell);

        // Create Value column (only for 'type' and other specific actions with values)
        const valueCell = document.createElement('td');
        if (action.type === 'type' || action.type === 'sendKey' || action.type === 'select option') {
          valueCell.textContent = action.value;
        } else {
          valueCell.textContent = ''; // No value for click actions
        }
        row.appendChild(valueCell);
        
        // Append the row to the table
        actionsTableBody.appendChild(row);
      });

      scrollToBottom(); // Scroll the last action into view once loading is complete
    } else {
      actionsTableBody.innerHTML = '<tr><td colspan="3">No actions recorded yet.</td></tr>';
    }

    updateActionButtons();
  });
}

// Delete selected actions when the delete button is clicked
deleteActionButton.addEventListener('click', () => {
  if (selectedRows.length === 0) {
    alert("Please select at least one action to delete.");
    return;
  }

  // Get the current actions in storage
  chrome.storage.local.get(['actions'], (data) => {
    const actions = data.actions || [];

    // Remove selected actions from the actions array
    const remainingActions = actions.filter((action, index) => !selectedRows.includes(index));

    // Update the actions in storage
    chrome.storage.local.set({ actions: remainingActions }, () => {
      loadActions(); // Reload the actions to show the updated list
      resetRowSelection(); // Reset the selection state after deletion
    });
  });
});

// Update the visibility of the action buttons (Add, Edit, Delete)
function updateActionButtons() {
  if (selectedRows.length === 0) {
    actionButtonsContainer.style.display = 'none'; // Hide buttons when no rows are selected
  } else if (selectedRows.length === 1) {
    actionButtonsContainer.style.display = 'flex'; // Show buttons when at least one row is selected
    addActionButton.style.display = 'inline-block';
    editActionButton.style.display = 'inline-block'; 
    deleteActionButton.style.display = 'inline-block';
  } else if (selectedRows.length >= 2) {
    actionButtonsContainer.style.display = 'flex'; // Show buttons when at least one row is selected
    addActionButton.style.display = 'none';
    editActionButton.style.display = 'none'; 
    deleteActionButton.style.display = 'inline-block';
  }
}

// ======================= ACTION BUTTONS HANDLERS ===========================

// ===================== Row Click and Selection =====================

actionsTableBody.addEventListener('click', (event) => {
  const row = event.target.closest('tr');
  if (!row) return;

  const index = Array.from(actionsTableBody.rows).indexOf(row);

  if (isShiftPressed) {
    // Shift + Click triggers editing
    editAction(index);
    row.classList.add('selected');
  } else {
    // Regular click selects or deselects the row
    toggleRowSelection(index, row);
  }
});

function toggleRowSelection(index, row) {
  if (!isShiftPressed) {
    if (row.classList.contains('selected')) {
      // If already selected, unselect it
      row.classList.remove('selected');
      selectedRows = selectedRows.filter(i => i !== index); // Remove from selectedRows
    } else {
      // Regular click to select the row
      selectedRows.push(index);
      row.classList.add('selected'); // Select the clicked row
    }
    updateActionButtons(); // Update buttons visibility
  }
}

// ===================== Row Click and Selection =====================

// ============= HELP BUTTON LOGIC ===============
const helpButton = document.createElement('button');
helpButton.textContent = '?';
helpButton.style.position = 'absolute';
helpButton.style.top = '10px';
helpButton.style.right = '10px';
helpButton.style.padding = '10px';
helpButton.style.fontSize = '16px';
helpButton.style.cursor = 'pointer';
helpButton.style.border = '1px solid #ddd';
helpButton.style.borderRadius = '50%';
helpButton.style.backgroundColor = '#f4f4f4';
helpButton.style.width = '40px';
helpButton.style.height = '40px';
helpButton.style.textAlign = 'center';

// Add the help button to the body
document.body.appendChild(helpButton);

// Show help message when clicking the help button
helpButton.addEventListener('click', () => {
  alert('Shift + Left Click on action rows to quick edit.');
});
// ============= HELP BUTTON LOGIC ===============

// ============= EXPORT BUTTON LOGIC ===============
// Handles the export custom actions button
exportCustomActionsButton.addEventListener('click', function() {
  chrome.storage.local.get(['actions'], function(result) {
    const actions = result.actions || [];
    let customActionsText = '';

    // Loop through each recorded action and convert it to the custom actions format
    actions.forEach(action => {
      if (action.type === 'click') {
        if (action.selectorType === 'css') {
          customActionsText += `actions.CustomClick(By.CssSelector("${action.selector}"));\n`;
        } else if (action.selectorType === 'xpath') {
          customActionsText += `actions.CustomClick(By.XPath("${action.selector}"));\n`;
        }
      } else if (action.type === 'type' || action.type === 'sendKey') {
        if (action.selectorType === 'css') {
          customActionsText += `actions.CustomType(By.CssSelector("${action.selector}"), "${action.value}");\n`;
        } else if (action.selectorType === 'xpath') {
          customActionsText += `actions.CustomType(By.XPath("${action.selector}"), "${action.value}");\n`;
        }
      } else if (action.type === 'select option') {
        if (action.selectorType === 'css') {
          customActionsText += `actions.SelectOption(By.CssSelector("${action.selector}"), "${action.value}");\n`;
        } else if (action.selectorType === 'xpath') {
          customActionsText += `actions.SelectOption(By.XPath("${action.selector}"), "${action.value}");\n`;
        }
      } else if (action.type === 'Verify Element Exists') {
        if (action.selectorType === 'css') {
          customActionsText += `actions.verifyElementExists(actions, By.CssSelector("${action.selector}"));\n`;
        } else if (action.selectorType === 'xpath') {
          customActionsText += `actions.verifyElementExists(actions, By.XPath("${action.selector}"));\n`;
        } 
      } else if (action.type === 'Verify Element Text') {
        // Clean up line breaks and unnecessary white spaces
        let cleanText = action.value.replace(/\n/g, '').replace(/\s+/g, ' ').trim();

        if (action.selectorType === 'css') {
          customActionsText += `actions.getTextAndCompare(actions, By.CssSelector("${action.selector}"), "${cleanText}");\n`;
        } else if (action.selectorType === 'xpath') {
          customActionsText += `actions.getTextAndCompare(actions, By.XPath("${action.selector}"), "${cleanText}");\n`;
        }
      } else if (action.type === 'Custom Action') {
        customActionsText += `Custom Action: ${action.selector}\n`;
      }
    });

    // Create a Blob object and trigger download
    const blob = new Blob([customActionsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'CustomActions.txt';
    link.click();
    URL.revokeObjectURL(url);  // Clean up the object URL
  });
});
// ============= EXPORT BUTTON LOGIC ===============

// ============= HELPERS =================

function detectSelectorType(selector) {
  const cssPattern = /^[a-zA-Z0-9.#,:=\[\]()'"\s>+*~^$|=-]+$/;

  // Check if the string contains an XPath pattern (starts with "//" or "/")
  if (selector.startsWith('//') || selector.startsWith('/')) {
    return 'xpath';
  } else if (cssPattern.test(selector)) {
    return 'css'
  }
  return null;
}

// Function to create an action entry
function createAction(type, selector, selectorType, value = null) {
  if (value != null && value != "") {
    value = value.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
  }
  let action = {
    type: type,
    selector: selector,
    selectorType: selectorType,
    value: value
  };

  return action;
}