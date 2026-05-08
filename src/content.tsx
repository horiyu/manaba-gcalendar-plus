console.log('===== MANABA GCALENDAR PLUS: 拡張機能が読み込まれました =====');

// Google Calendarフォームを探して子要素を出力する関数
const findAndLogCalendarForm = (): void => {
  console.log('===== MANABA GCALENDAR PLUS: フォーム検索開始 =====');
  
  // 指定されたフォーム要素を検索（セレクターを柔軟に）
  const forms = document.querySelectorAll<HTMLFormElement>('form');
  console.log('検出されたフォームの数:', forms.length);
  
  let targetForm: HTMLFormElement | null = null;
  
  // すべてのフォームを確認
  forms.forEach((form, index) => {
    console.log(`フォーム ${index}:`, 
      `method=${form.method}`, 
      `action=${form.action}`, 
      `target=${form.target}`);
    
    if (form.method.toUpperCase() === 'GET' && 
        form.action.includes('google.com/calendar/event') && 
        form.target === '_blank') {
      targetForm = form;
      console.log('対象のGoogleカレンダーフォームを発見:', index);
    }
  });

  if (targetForm) {
    console.log('===== Googleカレンダーフォームが見つかりました！ =====');

    // 子要素を取得して出力 - 型アサーションを使用して型エラーを解決
    const formElement = targetForm as HTMLFormElement;
    const children = formElement.children;
    console.log('子要素の数:', children.length);

    // 各子要素の詳細を出力
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      console.log(`子要素 ${i}:`, child);
      console.log(`子要素 ${i} のタグ名:`, child.tagName);
      console.log(`子要素 ${i} のHTML:`, child.outerHTML);
      
      // input要素の場合は属性を詳細に出力
      if (child.tagName === 'INPUT') {
        const input = child as HTMLInputElement;
        console.log(`input要素の情報 - name:${input.name}, type:${input.type}, value:${input.value}`);
      }
    }
  } else {
    console.log('===== Googleカレンダーフォームが見つかりませんでした =====');
    console.log('現在のURL:', window.location.href);
    console.log('ページ内のHTML:', document.documentElement.outerHTML.substring(0, 500) + '...');
  }
};

// コンテンツスクリプトの初期化
const initContentScript = (): void => {
  console.log('===== MANABA GCALENDAR PLUS: 初期化開始 =====');
  
  // ページ読み込み完了時に実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('===== MANABA GCALENDAR PLUS: DOMContentLoaded イベント発火 =====');
      findAndLogCalendarForm();
    });
  } else {
    findAndLogCalendarForm();
  }

  // 定期的にチェック（動的に追加される可能性があるため）
  const checkInterval = setInterval(() => {
    findAndLogCalendarForm();
  }, 3000); // 3秒ごとに確認

  // 30秒後にインターバルを停止
  setTimeout(() => {
    clearInterval(checkInterval);
    console.log('===== MANABA GCALENDAR PLUS: 定期的な確認を終了しました =====');
  }, 30000);

  // DOM変更を監視して動的に追加されるフォームも検出
  const observer = new MutationObserver(() => {
    findAndLogCalendarForm();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  setTimeout(() => {
    observer.disconnect();
    console.log('===== MANABA GCALENDAR PLUS: DOM変更の監視を終了しました =====');
  }, 30000);
};

initContentScript();
