document.addEventListener('DOMContentLoaded', () => {

    // --- 定数定義 (AppConfig相当) ---
    const CONFIG = {
        DEFAULT_MAIN_COLOR: '#3498DB',
        DEFAULT_BACKGROUND_COLOR: 'white',
        PREVIEW_MAX_SIZE: 800,
        ASPECT_RATIOS: {
            "16:9 (1920x1080)": [1920, 1080],
            "Instagram ストーリー (1080x1920)": [1080, 1920],
            "Instagram ポスト 縦 (1080x1350)": [1080, 1350],
            "Instagram ポスト 正方形 (1080x1080)": [1080, 1080],
            "4:3 (1280x960)": [1280, 960],
            "A4横 (1754x1240)": [1754, 1240],
            "A4縦 (1240x1754)": [1240, 1754],
            "カスタム": [-1, -1],
        },
        SCORE_MAPPING: {
            "s": 100, "a": 80, "b": 60, "c": 40, "d": 20,
            "最重要": 100, "重要": 80, "普通": 60, "補助": 40, "参考": 20,
            "critical": 100, "important": 80, "normal": 60, "minor": 40, "reference": 20,
            "高": 100, "high": 100, "中": 60, "medium": 60, "低": 30, "low": 30,
            "1": 100, "2": 80, "3": 60, "4": 40, "5": 20,
        },
        DEFAULT_SCORE: 60,
    };

    // --- DOM要素の取得 ---
    const elements = {
        textInput: document.getElementById('textInput'),
        fileInput: document.getElementById('fileInput'),
        aspectRatioSelect: document.getElementById('aspectRatio'),
        widthInput: document.getElementById('customWidth'),
        heightInput: document.getElementById('customHeight'),
        mainColorInput: document.getElementById('mainColor'),
        backgroundColorSelect: document.getElementById('backgroundColor'),
        shapeSelect: document.getElementById('wordcloudShape'),
        previewBtn: document.getElementById('previewBtn'),
        generateBtn: document.getElementById('generateBtn'),
        resetBtn: document.getElementById('resetBtn'),
        createSampleBtn: document.getElementById('createSampleBtn'),
        canvas: document.getElementById('wordCloudCanvas'),
        previewContainer: document.getElementById('previewContainer'),
        placeholder: document.getElementById('placeholder'),
        logContainer: document.getElementById('logContainer'),
    };
    
    const sampleModal = new bootstrap.Modal(document.getElementById('sampleModal'));
    let wordData = [];

    // --- ロジック (WordCloudLogic相当) ---

    const convertTierToScore = (tierValue) => {
        if (tierValue === null || tierValue === undefined || tierValue === '') {
            return CONFIG.DEFAULT_SCORE;
        }
        const tierStr = String(tierValue).trim().toLowerCase();
        
        // 数値かどうかチェック
        if (!isNaN(tierStr) && tierStr.length > 0) {
            const score = parseFloat(tierStr);
            return Math.max(0, Math.min(100, score));
        }
        
        return CONFIG.SCORE_MAPPING[tierStr] || CONFIG.DEFAULT_SCORE;
    };
    
    const parseData = (data) => {
        return data
            .map(row => ({ word: String(row[0]).trim(), score: convertTierToScore(row[1]) }))
            .filter(item => item.word);
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        log(`ファイル読み込み中: ${file.name}`);
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                wordData = parseData(jsonData);
                log(`${wordData.length}件の単語を読み込みました。`, 'success');
                elements.previewBtn.click(); // 自動でプレビューを更新
            } catch (err) {
                log(`ファイル処理エラー: ${err.message}`, 'danger');
            }
        };
        
        reader.onerror = () => {
             log(`ファイル読み込みエラーが発生しました。`, 'danger');
        };

        reader.readAsArrayBuffer(file);
    };
    
    const handleTextInput = () => {
        const text = elements.textInput.value;
        if (!text.trim()) {
            wordData = [];
            return;
        }

        const lines = text.split('\n').filter(line => line.trim() !== '');
        const data = lines.map(line => {
             // カンマ、タブ、複数のスペースなど、柔軟な区切り文字に対応
            const parts = line.split(/[\t, ]+/).filter(p => p);
            return [parts[0], parts.slice(1).join(' ')];
        });
        
        wordData = parseData(data);
        log(`${wordData.length}件の単語をテキストから読み込みました。`, 'info');
    };
    
    const createColorFunction = (mainColorHex) => {
        // 16進数カラーコードをRGBに変換
        const hexToRgb = (hex) => {
            let r = 0, g = 0, b = 0;
            if (hex.length == 4) {
                r = "0x" + hex[1] + hex[1];
                g = "0x" + hex[2] + hex[2];
                b = "0x" + hex[3] + hex[3];
            } else if (hex.length == 7) {
                r = "0x" + hex[1] + hex[2];
                g = "0x" + hex[3] + hex[4];
                b = "0x" + hex[5] + hex[6];
            }
            return [Number(r), Number(g), Number(b)];
        };

        const [r, g, b] = hexToRgb(mainColorHex);

        // メインカラーを基準に濃淡のバリエーションを返す関数を生成
        return (word, weight, fontSize, distance, theta) => {
            // weightはwordcloud2.jsではスコアの最大値に対する比率になる
            // スコアが高いほど濃い色にする
            const alpha = 0.5 + (weight / 100) * 0.5;
            return `rgba(${r},${g},${b},${alpha})`;
        };
    };

    const generateWordCloud = (isPreview) => {
        if (wordData.length === 0) {
            handleTextInput(); // テキスト入力があればパース
            if (wordData.length === 0) {
                log('ワードクラウドを生成するためのデータがありません。', 'warning');
                return;
            }
        }

        log(`ワードクラウド${isPreview ? 'プレビュー' : '生成'}中...`);
        setUiEnabled(false);
        elements.placeholder.style.display = 'none';

        let width = parseInt(elements.widthInput.value);
        let height = parseInt(elements.heightInput.value);
        
        if (isPreview) {
            const max_size = CONFIG.PREVIEW_MAX_SIZE;
            if (width > height) {
                height = parseInt(height * (max_size / width));
                width = max_size;
            } else {
                width = parseInt(width * (max_size / height));
                height = max_size;
            }
        }
        
        // wordcloud2.jsは weight 値でフォントサイズが決まるため、スコアをそのままリストにする
        const list = wordData.map(item => [item.word, item.score]);

        const options = {
            list: list,
            gridSize: Math.round(16 * width / 1024),
            weightFactor: (size) => (size * width) / 500, // フォントサイズ調整
            fontFamily: "'Noto Sans JP', sans-serif",
            color: createColorFunction(elements.mainColorInput.value),
            backgroundColor: elements.backgroundColorSelect.value === 'transparent' ? 'rgba(0,0,0,0)' : elements.backgroundColorSelect.value,
            rotateRatio: 0, // 水平固定
            shape: elements.shapeSelect.value,
            width: width,
            height: height,
            clearCanvas: true,
        };
        
        if (isPreview) {
            // プレビューコンテナのサイズを調整
            elements.previewContainer.style.paddingTop = `${(height/width) * 100}%`;
            WordCloud(elements.canvas, options);
            log('プレビューを更新しました。', 'success');
            setUiEnabled(true);
        } else {
            // ダウンロード用には非表示のcanvasを使う
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = width;
            offscreenCanvas.height = height;
            WordCloud(offscreenCanvas, options);
            
            // 少し待ってからダウンロードリンクを作成（描画完了を待つ）
            setTimeout(() => {
                const dataUrl = offscreenCanvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.href = dataUrl;
                link.download = 'wordcloud.png';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                log('画像を保存しました！', 'success');
                setUiEnabled(true);
            }, 500);
        }
    };
    
    // --- UI制御 (WordCloudGUI相当) ---

    const initAspectRatioOptions = () => {
        Object.keys(CONFIG.ASPECT_RATIOS).forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key;
            elements.aspectRatioSelect.appendChild(option);
        });
    };
    
    const onAspectRatioChange = () => {
        const selected = elements.aspectRatioSelect.value;
        const isCustom = selected === "カスタム";

        elements.widthInput.disabled = !isCustom;
        elements.heightInput.disabled = !isCustom;

        if (!isCustom) {
            const [width, height] = CONFIG.ASPECT_RATIOS[selected];
            elements.widthInput.value = width;
            elements.heightInput.value = height;
        }
    };
    
    const resetSettings = () => {
        elements.fileInput.value = '';
        elements.textInput.value = '';
        wordData = [];
        elements.aspectRatioSelect.selectedIndex = 0;
        onAspectRatioChange();
        elements.mainColorInput.value = CONFIG.DEFAULT_MAIN_COLOR;
        elements.backgroundColorSelect.value = CONFIG.DEFAULT_BACKGROUND_COLOR;
        elements.shapeSelect.value = 'rectangle';

        // プレビューをリセット
        const ctx = elements.canvas.getContext('2d');
        ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
        elements.placeholder.style.display = 'flex';
        elements.previewContainer.style.paddingTop = '56.25%';

        log('設定をリセットしました。');
    };
    
    const setUiEnabled = (enabled) => {
        const controls = [
            elements.textInput, elements.fileInput, elements.aspectRatioSelect,
            elements.widthInput, elements.heightInput, elements.mainColorInput,
            elements.backgroundColorSelect, elements.shapeSelect, elements.previewBtn,
            elements.generateBtn, elements.resetBtn
        ];
        controls.forEach(el => el.disabled = !enabled);
        
        // アスペクト比の状態を復元
        if (enabled) {
            onAspectRatioChange();
        }
    };

    const log = (message, type = 'info') => {
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show p-2 mb-2`;
        alert.setAttribute('role', 'alert');
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close p-2" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        elements.logContainer.prepend(alert);
        // 古いログを削除
        if (elements.logContainer.children.length > 5) {
            elements.logContainer.lastChild.remove();
        }
    };


    // --- イベントリスナーの登録 ---
    elements.aspectRatioSelect.addEventListener('change', onAspectRatioChange);
    elements.fileInput.addEventListener('change', handleFileUpload);
    elements.textInput.addEventListener('input', handleTextInput);
    elements.previewBtn.addEventListener('click', () => generateWordCloud(true));
    elements.generateBtn.addEventListener('click', () => generateWordCloud(false));
    elements.resetBtn.addEventListener('click', resetSettings);
    elements.createSampleBtn.addEventListener('click', () => sampleModal.show());

    // --- 初期化処理 ---
    const init = () => {
        initAspectRatioOptions();
        resetSettings();
        log('アプリケーションの準備ができました。');
    };
    
    init();
}); 