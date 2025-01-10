document.addEventListener('DOMContentLoaded', function() {
  loadImages();
  document.getElementById('exportPdf').addEventListener('click', exportToPdf);
  document.getElementById('clearAll').addEventListener('click', clearAllScreenshots);
  initPasteArea();
  initSelectionOrder();
});

// 保存选择顺序
let selectedOrder = new Map();
let selectionCount = 0;

function initSelectionOrder() {
  document.addEventListener('change', function(e) {
    if (e.target.classList.contains('image-checkbox')) {
      const checkbox = e.target;
      const filename = checkbox.dataset.filename;
      const orderLabel = checkbox.parentElement.querySelector('.selection-order');
      
      if (checkbox.checked) {
        selectionCount++;
        selectedOrder.set(filename, selectionCount);
        // 创建或更新角标
        if (!orderLabel) {
          const label = document.createElement('div');
          label.className = 'selection-order';
          label.textContent = selectionCount;
          checkbox.parentElement.appendChild(label);
        } else {
          orderLabel.textContent = selectionCount;
        }
      } else {
        // 移除角标和选择顺序
        if (orderLabel) {
          orderLabel.remove();
        }
        selectedOrder.delete(filename);
        // 更新其他角标的数字
        updateSelectionNumbers();
      }
    }
  });
}

function updateSelectionNumbers() {
  // 重新计算选择数量
  selectionCount = 0;
  const newOrder = new Map();
  
  // 获取所有选中的复选框，按原有顺序排序
  const checkedBoxes = Array.from(document.querySelectorAll('.image-checkbox:checked'))
    .sort((a, b) => {
      const orderA = selectedOrder.get(a.dataset.filename) || 0;
      const orderB = selectedOrder.get(b.dataset.filename) || 0;
      return orderA - orderB;
    });
  
  // 更新编号
  checkedBoxes.forEach(checkbox => {
    selectionCount++;
    const filename = checkbox.dataset.filename;
    newOrder.set(filename, selectionCount);
    const label = checkbox.parentElement.querySelector('.selection-order');
    if (label) {
      label.textContent = selectionCount;
    }
  });
  
  selectedOrder = newOrder;
}

function clearAllScreenshots() {
  if (confirm('确定要清空所有截图吗？')) {
    chrome.storage.local.set({ screenshots: [] }, function() {
      // 清空后重新加载图片列表
      loadImages();
    });
  }
}

function loadImages() {
  chrome.storage.local.get(['screenshots'], function(result) {
    const screenshots = result.screenshots || [];
    const grid = document.getElementById('imageGrid');
    
    // 保存当前选中的文件名和顺序
    const checkedFiles = Array.from(document.querySelectorAll('.image-checkbox:checked'))
      .map(checkbox => ({
        filename: checkbox.dataset.filename,
        order: selectedOrder.get(checkbox.dataset.filename)
      }));
    
    // 按时间排序
    screenshots.sort((a, b) => b.timestamp - a.timestamp);
    
    if (screenshots.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: #666;">暂无截图</div>';
      return;
    }
    
    grid.innerHTML = screenshots.map(screenshot => {
      const isChecked = checkedFiles.find(f => f.filename === screenshot.filename);
      const order = isChecked ? isChecked.order : null;
      return `
        <div class="image-item">
          <input type="checkbox" class="image-checkbox" 
            data-filename="${screenshot.filename}"
            ${isChecked ? 'checked' : ''}
          >
          ${order ? `<div class="selection-order">${order}</div>` : ''}
          <img 
            src="${screenshot.dataUrl}" 
            alt="${screenshot.filename}"
            onerror="this.onerror=null; this.src='images/error.png';"
          >
        </div>
      `;
    }).join('');

    // 添加图片加载完成的日志
    console.log('Images loaded:', screenshots.length);
    
    // 验证图片是否正确加载
    const images = grid.getElementsByTagName('img');
    Array.from(images).forEach(img => {
      img.addEventListener('load', () => {
        console.log('Image loaded successfully:', img.alt);
      });
      img.addEventListener('error', () => {
        console.error('Image failed to load:', img.alt);
      });
    });
  });
}

async function exportToPdf() {
  const selectedImages = Array.from(document.querySelectorAll('.image-checkbox:checked'))
    .sort((a, b) => {
      const orderA = selectedOrder.get(a.dataset.filename) || 0;
      const orderB = selectedOrder.get(b.dataset.filename) || 0;
      return orderA - orderB;
    });

  if (selectedImages.length === 0) {
    alert('请选择要导出的图片');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 10;

  try {
    // 预加载所有图片
    const loadedImages = await Promise.all(selectedImages.map(async checkbox => {
      // 从 storage 中获取原始图片数据
      const filename = checkbox.dataset.filename;
      const result = await chrome.storage.local.get(['screenshots']);
      const screenshots = result.screenshots || [];
      const screenshot = screenshots.find(s => s.filename === filename);
      
      if (!screenshot) {
        throw new Error(`Image not found: ${filename}`);
      }
      
      return new Promise((resolve, reject) => {
        const tempImg = new Image();
        tempImg.onload = () => {
          resolve({
            element: tempImg,
            dataUrl: screenshot.dataUrl
          });
        };
        tempImg.onerror = () => reject(new Error(`Failed to load image: ${filename}`));
        tempImg.src = screenshot.dataUrl;
      });
    }));

    // 添加图片到PDF
    for (const {element: tempImg, dataUrl} of loadedImages) {
      // 计算图片尺寸，保持宽高比
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 10;
      const maxWidth = pageWidth - 2 * margin;
      const imgWidth = maxWidth;
      const imgHeight = (tempImg.height * imgWidth) / tempImg.width;
      
      // 如果图片会超出页面底部，添加新页
      if (y + imgHeight > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      
      // 添加图片到PDF
      doc.addImage(dataUrl, 'PNG', margin, y, imgWidth, imgHeight);
      y += imgHeight + 10; // 添加一些间距
    }

    doc.save('screenshots.pdf');
  } catch (error) {
    console.error('Error generating PDF:', error.message || error);
    alert('生成PDF时出错，请重试');
  }
}

function initPasteArea() {
  const pasteBox = document.getElementById('pasteBox');
  
  // 处理粘贴事件
  pasteBox.addEventListener('paste', function(e) {
    e.preventDefault();
    const items = e.clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        const reader = new FileReader();
        
        reader.onload = function(e) {
          const dataUrl = e.target.result;
          saveScreenshot(dataUrl);
        };
        
        reader.readAsDataURL(blob);
        break;
      }
    }
  });
  
  // 点击时获取焦点
  pasteBox.addEventListener('click', function() {
    this.focus();
  });
  
  // 处理拖放
  pasteBox.addEventListener('dragover', function(e) {
    e.preventDefault();
    this.classList.add('dragover');
  });
  
  pasteBox.addEventListener('dragleave', function(e) {
    e.preventDefault();
    this.classList.remove('dragover');
  });
  
  pasteBox.addEventListener('drop', function(e) {
    e.preventDefault();
    this.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.indexOf('image') !== -1) {
      const reader = new FileReader();
      reader.onload = function(e) {
        saveScreenshot(e.target.result);
      };
      reader.readAsDataURL(files[0]);
    }
  });
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
    chrome.storage.local.set({ screenshots: screenshots }, function() {
      loadImages();  // 重新加载图片列表
    });
  });
} 