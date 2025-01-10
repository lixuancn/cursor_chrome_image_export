let isScreenshotMode = false;  // 添加状态标志

chrome.commands.onCommand.addListener((command) => {
  if (command === "take-screenshot") {
    takeFullScreenshot();
  } else if (command === "take-area-screenshot") {
    // 只有在非截图模式时才启动截图
    if (!isScreenshotMode) {
      takeAreaScreenshot();
    }
  }
});

async function takeFullScreenshot() {
  const tab = await getCurrentTab();
  
  chrome.tabs.captureVisibleTab(null, {format: 'png'}, function(dataUrl) {
    saveScreenshot(dataUrl);
  });
}

async function takeAreaScreenshot() {
  const tab = await getCurrentTab();
  
  // 检查是否是chrome://页面
  if (tab.url.startsWith('chrome://')) {
    console.error('Cannot take screenshots of chrome:// pages');
    // 可以选择显示一个通知给用户
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'images/icon128.png',
      title: '无法截图',
      message: '由于浏览器限制，无法对chrome://页面进行截图'
    });
    return;
  }
  
  isScreenshotMode = true;
  
  // 注入选区工具
  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    css: `
      .screenshot-area {
        position: fixed;
        border: 2px solid #1a73e8;
        background: rgba(26, 115, 232, 0.1);
        z-index: 999999;
      }
      .screenshot-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.1);
        z-index: 999998;
        cursor: crosshair;
      }
      .debug-point {
        position: fixed;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        z-index: 999999;
        pointer-events: none;
      }
      .start-point {
        background: red;
      }
      .end-point {
        background: blue;
      }
    `
  });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: initializeAreaSelection
  });
}

function initializeAreaSelection() {
  let startX, startY, isDrawing = false;
  let overlay, selection;
  let eventListenersAdded = false;

  // 先移除可能存在的旧元素和监听器
  const cleanup = () => {
    const oldOverlay = document.querySelector('.screenshot-overlay');
    const oldSelection = document.querySelector('.screenshot-area');
    const oldStartPoint = document.getElementById('debug-start-point');
    const oldEndPoint = document.getElementById('debug-end-point');
    
    if (oldOverlay) oldOverlay.remove();
    if (oldSelection) oldSelection.remove();
    if (oldStartPoint) oldStartPoint.remove();
    if (oldEndPoint) oldEndPoint.remove();
    
    // 如果之前添加过监听器，先移除它们
    if (eventListenersAdded) {
      document.removeEventListener('mousedown', startDrawing);
      document.removeEventListener('mousemove', drawSelection);
      document.removeEventListener('mouseup', endDrawing);
      document.removeEventListener('keydown', handleKeydown);
      eventListenersAdded = false;
    }
  };
  
  cleanup();

  // 创建遮罩层
  overlay = document.createElement('div');
  overlay.className = 'screenshot-overlay';
  document.body.appendChild(overlay);

  // 将事件监听器添加到document上，以捕获所有鼠标事件
  document.addEventListener('mousedown', startDrawing);
  document.addEventListener('mousemove', drawSelection);
  document.addEventListener('mouseup', endDrawing);
  document.addEventListener('keydown', handleKeydown);
  eventListenersAdded = true;

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      exitScreenshotMode();
    }
  }

  function startDrawing(e) {
    // 防止事件冒泡
    e.stopPropagation();
    e.preventDefault();
    isDrawing = true;
    // 记录相对于页面的初始坐标
    startX = e.clientX + window.scrollX;
    startY = e.clientY + window.scrollY;

    // 添加起始点标记
    const startPoint = document.createElement('div');
    startPoint.className = 'debug-point start-point';
    startPoint.style.left = (e.clientX - 5) + 'px';
    startPoint.style.top = (e.clientY - 5) + 'px';
    startPoint.id = 'debug-start-point';
    document.body.appendChild(startPoint);

    selection = document.createElement('div');
    selection.className = 'screenshot-area';
    document.body.appendChild(selection);
  }

  function drawSelection(e) {
    if (!isDrawing) return;
    // 防止事件冒泡
    e.stopPropagation();
    e.preventDefault();

    const currentX = e.clientX + window.scrollX;
    const currentY = e.clientY + window.scrollY;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    // 选择框需要使用视口坐标
    selection.style.left = (left - window.scrollX) + 'px';
    selection.style.top = (top - window.scrollY) + 'px';
    selection.style.width = width + 'px';
    selection.style.height = height + 'px';
  }

  function endDrawing(e) {
    if (!isDrawing) return;
    isDrawing = false;

    // 保存坐标信息
    const endX = e.clientX + window.scrollX;
    const endY = e.clientY + window.scrollY;
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    
    // 先移除所有UI元素和事件监听器
    cleanup();

    // 发送选区信息给background脚本
    chrome.runtime.sendMessage({
      type: 'capture-area',
      area: {
        x: left,
        y: top,
        width: width,
        height: height
      },
      viewport: {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight
      }
    });

    // 延迟通知退出截图模式
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'exit-screenshot-mode' });
    }, 500);
  }
  
  function exitScreenshotMode() {
    cleanup();
    // 通知 background 脚本退出截图模式
    chrome.runtime.sendMessage({ type: 'exit-screenshot-mode' });
  }
}

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'capture-area') {
    chrome.tabs.captureVisibleTab(null, {format: 'png'}, function(dataUrl) {
      cropScreenshot(dataUrl, message.area, message.viewport);
    });
  } else if (message.type === 'exit-screenshot-mode') {
    isScreenshotMode = false;
  }
});

async function cropScreenshot(dataUrl, area, viewport) {
  try {
    // 创建位图
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    
    // 计算设备像素比
    const scale = Math.round(bitmap.width / viewport.width);
    
    console.log('Scale calculation:', {
      bitmapWidth: bitmap.width,
      viewportWidth: viewport.width,
      computedScale: scale
    });
    
    // 调整坐标和尺寸以匹配实际像素
    const scaledArea = {
      x: Math.round(area.x * scale),
      y: Math.round(area.y * scale),
      width: Math.round(area.width * scale),
      height: Math.round(area.height * scale)
    };
    
    console.log('Cropping screenshot:', {
      area,
      scaledArea,
      bitmap: {
        width: bitmap.width,
        height: bitmap.height
      }
    });

    // 确保坐标和尺寸在有效范围内
    const validArea = {
      x: Math.max(0, Math.min(scaledArea.x, bitmap.width)),
      y: Math.max(0, Math.min(scaledArea.y, bitmap.height)),
      width: Math.min(scaledArea.width, bitmap.width - scaledArea.x),
      height: Math.min(scaledArea.height, bitmap.height - scaledArea.y)
    };

    // 检查区域是否有效
    if (validArea.width <= 0 || validArea.height <= 0 || 
        validArea.x >= bitmap.width || validArea.y >= bitmap.height) {
      console.error('Area is outside of image bounds:', { original: area, valid: validArea });
      return;
    }

    // 使用 OffscreenCanvas
    const canvas = new OffscreenCanvas(validArea.width, validArea.height);
    const ctx = canvas.getContext('2d');
    
    // 绘制选中区域
    ctx.drawImage(bitmap,
      validArea.x, validArea.y, validArea.width, validArea.height,
      0, 0, validArea.width, validArea.height
    );

    console.log('Crop operation completed:', {
      source: {
        x: validArea.x,
        y: validArea.y,
        width: validArea.width,
        height: validArea.height
      },
      canvas: {
        width: canvas.width,
        height: canvas.height
      }
    });
    
    // 转换为 blob
    const croppedBlob = await canvas.convertToBlob({
      type: 'image/png',
      quality: 1.0
    });
    
    // 转换为 dataURL
    const croppedDataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(croppedBlob);
    });
    
    console.log('Area screenshot captured:', {
      width: area.width,
      height: area.height,
      dataUrl: croppedDataUrl.substring(0, 100) + '...'
    });
    
    saveScreenshot(croppedDataUrl);
  } catch (error) {
    console.error('Error loading image for cropping:', error);
  }
}

function saveScreenshot(dataUrl) {
  const timestamp = new Date().getTime();
  
  const filename = `screenshots/screenshot_${timestamp}.png`;
  
  // 保存到本地存储
  chrome.storage.local.get(['screenshots'], function(result) {
    const screenshots = result.screenshots || [];
    screenshots.push({
      filename: filename,
      dataUrl: dataUrl,
      timestamp: timestamp
    });
    chrome.storage.local.set({ screenshots: screenshots });
  });
  
  // 下载图片
  chrome.downloads.download({
    url: dataUrl,
    filename: filename,
    saveAs: false,
    conflictAction: 'overwrite'
  }, function(downloadId) {
    if (chrome.runtime.lastError) {
      console.error('Download failed:', chrome.runtime.lastError);
    } else {
      console.log('Screenshot saved:', filename);
    }
  });
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  return tab;
} 