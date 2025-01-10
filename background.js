chrome.commands.onCommand.addListener((command) => {
  if (command === "take-screenshot") {
    takeFullScreenshot();
  } else if (command === "take-area-screenshot") {
    takeAreaScreenshot();
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

  // 创建遮罩层
  overlay = document.createElement('div');
  overlay.className = 'screenshot-overlay';
  document.body.appendChild(overlay);

  overlay.addEventListener('mousedown', startDrawing);
  overlay.addEventListener('mousemove', drawSelection);
  overlay.addEventListener('mouseup', endDrawing);

  function startDrawing(e) {
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;

    selection = document.createElement('div');
    selection.className = 'screenshot-area';
    document.body.appendChild(selection);
  }

  function drawSelection(e) {
    if (!isDrawing) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    selection.style.left = left + 'px';
    selection.style.top = top + 'px';
    selection.style.width = width + 'px';
    selection.style.height = height + 'px';
  }

  function endDrawing(e) {
    if (!isDrawing) return;
    isDrawing = false;

    const rect = selection.getBoundingClientRect();
    
    // 移除选区和遮罩
    selection.remove();
    overlay.remove();

    // 发送选区信息给background脚本
    chrome.runtime.sendMessage({
      type: 'capture-area',
      area: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      }
    });
  }
}

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'capture-area') {
    chrome.tabs.captureVisibleTab(null, {format: 'png'}, function(dataUrl) {
      cropScreenshot(dataUrl, message.area);
    });
  }
});

async function cropScreenshot(dataUrl, area) {
  try {
    // 使用 OffscreenCanvas
    const canvas = new OffscreenCanvas(area.width, area.height);
    const ctx = canvas.getContext('2d');
    
    // 创建临时 OffscreenCanvas
    const tempCanvas = new OffscreenCanvas(1, 1);  // 临时大小
    const tempCtx = tempCanvas.getContext('2d');
    
    // 从 dataUrl 加载图片数据
    const imageData = await fetch(dataUrl);
    const blob = await imageData.blob();
    const bitmap = await createImageBitmap(blob);
    
    // 设置临时 canvas 大小为原始图片大小
    tempCanvas.width = bitmap.width;
    tempCanvas.height = bitmap.height;
    
    // 在临时 canvas 上绘制完整图片
    tempCtx.drawImage(bitmap, 0, 0);
    
    // 从临时 canvas 复制选定区域到最终 canvas
    ctx.drawImage(tempCanvas, 
      area.x, area.y, area.width, area.height,
      0, 0, area.width, area.height);
    
    // 将 OffscreenCanvas 转换为 Blob
    const croppedBlob = await canvas.convertToBlob({
      type: 'image/png',
      quality: 1.0
    });
    
    // 将 Blob 转换为 DataURL
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
    console.error('Error processing screenshot:', error);
  }
}

function saveScreenshot(dataUrl) {
  const timestamp = new Date().getTime();
  const filename = `screenshot_${timestamp}.png`;
  
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
    saveAs: false
  });
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  return tab;
} 