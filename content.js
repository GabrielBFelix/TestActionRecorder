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

// Capture clicks
document.addEventListener('mousedown', function(event) {
  chrome.storage.local.get(['isRecording'], function(result) {
    if (event.button === 0) {
      console.log("mouse down event triggered")
      const isRecording = result.isRecording || false;
      
      if (isRecording && !isInExtensionPopup(event.target)) {
        const { selector, selectorType } = getElementSelector(event.target);
        const actionData = createAction('click', selector, selectorType, null);

        setTimeout(function() {
          chrome.storage.local.get(['actions'], function(result) {
            let actions = result.actions || [];
            actions.push(actionData);
            chrome.storage.local.set({ actions: actions });
          });
        }, 10);
      }
    }
  });
}, true);

// Capture typing
document.addEventListener('keyup', function(event) {
  chrome.storage.local.get(['isRecording'], function(result) {
    const isRecording = result.isRecording || false;
    
    if (isRecording && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') && isCharKey(event.key) && !isInExtensionPopup(event.target)) {

      console.log("keyup triggered (typing on inputs)")
      const { selector, selectorType } = getElementSelector(event.target);
      const actionData = createAction('type', selector, selectorType, event.target.value);

      chrome.storage.local.get(['actions'], function(result) {
        let actions = result.actions || [];

        // Get the last action
        const lastAction = actions.length > 0 ? actions[actions.length - 1] : null;

        // Check if the last action is a "click" action and has the same selector
        if (
          lastAction &&
          lastAction.type === 'click' &&
          lastAction.selector === actionData.selector
        ) {
          actions = actions.slice(0, actions.length - 1); // Remove the last action since it was a click in the same input
        }

        // Check if the last action is a "type" action and has the same selector
        if (
          lastAction &&
          lastAction.type === 'type' &&
          lastAction.selector === actionData.selector
        ) {
          actions = actions.slice(0, actions.length - 1); // Remove the last action
        }

        // Add the new action
        actions.push(actionData);

        // Save the updated actions list
        chrome.storage.local.set({ actions: actions });
      });
    }
  });
}, true);

// Capture keyboard clicks (currently tracks Enter)
document.addEventListener('keydown', function(event) {
  chrome.storage.local.get(['isRecording'], function(result) {
    const isRecording = result.isRecording || false;
    console.log("keydown event triggered");
    if (isRecording && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') && event.key === 'Enter' && !isInExtensionPopup(event.target)) {
      const { selector, selectorType } = getElementSelector(event.target);
      const actionData = createAction('sendKey', selector, selectorType, event.key);

      setTimeout(function() {
        chrome.storage.local.get(['actions'], function(result) {
          let actions = result.actions || [];
          actions.push(actionData);
          chrome.storage.local.set({ actions: actions });
        });
      }, 10);
    }
  });
}, true);

// Capture select option changes
document.addEventListener('change', function(event) {
  chrome.storage.local.get(['isRecording'], function(result) {
    const isRecording = result.isRecording || false;
    
    if (isRecording && event.target.tagName === 'SELECT' && !isInExtensionPopup(event.target)) {
      console.log("select action triggered")
      const { selector, selectorType } = getElementSelector(event.target);
      const actionData = createAction('select option', selector, selectorType, event.target.options[event.target.selectedIndex].text);

      setTimeout(function() {
        chrome.storage.local.get(['actions'], function(result) {
          let actions = result.actions || [];
          actions.push(actionData);
          chrome.storage.local.set({ actions: actions });
        });
      }, 10);
    }
  });
}, true);

// Transforms element class from "mt-3.d-flex justify-content-center" into ".mt-3.d-flex.justify-content-center"
function getClassSelector(element) {
  if (!element.className) return false;
  const classList = element.className.trim().split(/\s+/);
  return "." + classList.join(".");
}

// Function to generate XPath selector for the element's text
function getTextSelector(element) {
  const text = element.textContent.trim();
  const tagName = element.tagName.toLowerCase();
  return `//${tagName}[.='${text}']`;
}

// Check if the class exists and if there is only one element with that class
function isClassunique(element) {
  const classSelector = getClassSelector(element);
  return classSelector && document.querySelectorAll(classSelector).length === 1;
}

// Check if the id exists and if there is only one element with that id
function isIdUnique(element) {
  const id = element.id;
  const selectorMatches = document.querySelectorAll(`[id='${id}']`).length
  return id && selectorMatches === 1;
}

// Function to check if the element's text content is unique
function isTextUnique(element) {
  const text = element.textContent.trim();
  const tagName = element.tagName.toLowerCase();

  // Check if there is exactly one element of the specific tag and text
  const xpathQuery = `//${tagName}[.='${text}']`;
  return document.evaluate(xpathQuery, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null).snapshotLength === 1;
}

function getElementSelector(element) {
  let selector = element.tagName.toLowerCase();
  let selectorType = 'CssSelector';  // Default to CSS selector

  // If the element has an id, return the id as the selector
  if (element.id && isIdUnique(element) && !isElementWithRandomId(element)) {
    if(containsOnlyNumbers(element.id)) selector = `[id='${element.id}']`;
    else selector = `#${element.id}`;
    return { selector, selectorType };
  }

  // If the class uniquely identifies the element, return it
  if (element.className && isClassunique(element)) {
    selector = getClassSelector(element);
    return { selector, selectorType };
  }

  // If the element text uniquely identifies the element, return it
  if (element.textContent.trim() && isTextUnique(element)) {
    selectorType = 'XPath';
    selector = getTextSelector(element);
    return { selector, selectorType };
  }

  // Navigate through parents until unique id or class is found
  // If neither a unique id / class are found, return full path once html tag is reached.
  let currentElement = element;
  let parentSelector = "";

  while (currentElement.parentElement) {
    let tagName = currentElement.tagName.toLowerCase();
    let siblings = Array.from(currentElement.parentElement.children);

    // Count siblings of the same tag and find the position of the current element
    let sameTagSiblings = siblings.filter(sibling => sibling.tagName.toLowerCase() === tagName);
    let position = sameTagSiblings.indexOf(currentElement) + 1; // 1-based index for nth-of-type

    // If there are multiple siblings, apply nth-of-type
    if (sameTagSiblings.length > 1) {
      parentSelector = ` > ${tagName}:nth-of-type(${position})${parentSelector}`;
    } else {
      parentSelector = ` > ${tagName}${parentSelector}`;
    }

    currentElement = currentElement.parentElement;

    // Check if a unique id is found
    if (currentElement.id && isIdUnique(currentElement) && !isElementWithRandomId(element)) {
      if(containsOnlyNumbers(currentElement.id)) selector = `[id='${currentElement.id}']${parentSelector}`;
      else selector = `#${currentElement.id}${parentSelector}`;
      return { selector, selectorType };
    }
    // Check if a unique class is found
    else if (currentElement.className && isClassunique(currentElement)) {
      selector = `.${currentElement.className.split(' ')[0]}${parentSelector}`;
      return { selector, selectorType };
    }
    // If the html tag is reached, add it to the selector
    else if (currentElement.tagName.toLowerCase() === "html") {
      selector = `html${parentSelector}`;
      return { selector, selectorType };
    }
  }
}

function containsOnlyNumbers(str) {
  return /^(\d+(\.\d*)?|\.)$/.test(str);
}

function isCharKey(key) {
  // Check if the key is a letter (lowercase or uppercase), number, or common special characters
  const validKey = /^[\w\d!@#$%^&*()_+={}\[\]|\\:;\"'<>,.?/`~\-\s]+$/;
  return validKey.test(key);
}

// Function to check if an element's ID matches any of the elements in the list
function isElementWithRandomId(element) {
  const elementId = element.id || '';
  
  // Check if the element ID contains any of the partial IDs from the list
  return elementsWithRandomIds.some(partialId => elementId.includes(partialId));
}

// Check if the target element is inside the element with id "extensionPopUp"
function isInExtensionPopup(targetElement) {
  return targetElement.closest('html#extensionPopUp') !== null;
} 

// List of partial IDs for elements with random IDs
const elementsWithRandomIds = [
  'buttonOkModalDialog',
  'buttonNoModalDialog',
  'buttonCancelModalDialog'
];

let lastRightClickedElement = null; // Store the last element that was right clicked

// Listen for the right-click event
document.addEventListener('mouseup', function(event) {
  if (event.button === 2) { // 2 corresponds to the right mouse button
    // Save the element that was right-clicked
    lastRightClickedElement = {
      element: event.target,
      elementText: event.target.innerText
    }
  }
});

// Listener for the verify element exists action
chrome.runtime.onMessage.addListener(function(request) {
  if (request.message === "Verify Element Exists") {
    const { selector, selectorType } = getElementSelector(lastRightClickedElement.element);
    const actionData = createAction('Verify Element Exists', selector, selectorType);

    chrome.storage.local.get(['actions'], function(result) {
      let actions = result.actions || [];
      actions.push(actionData);
      chrome.storage.local.set({ actions: actions });
    });
  }
});

// Listener for the verify element text action
chrome.runtime.onMessage.addListener(function(request) {
  if (request.message === "Verify Element Text") {
    const { selector, selectorType } = getElementSelector(lastRightClickedElement.element);
    const actionData = createAction('Verify Element Text', selector, selectorType, lastRightClickedElement.elementText);

    chrome.storage.local.get(['actions'], function(result) {
      let actions = result.actions || [];
      actions.push(actionData);
      chrome.storage.local.set({ actions: actions });
    });
  }
});