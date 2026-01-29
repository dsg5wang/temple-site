  /* ======================================
           Email 驗證
        ====================================== */
  const emailEl = document.getElementById("email");
  const emailErrorEl = document.getElementById("emailError");

  function checkEmail() {
      const e = emailEl.value.trim();
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (e && !re.test(e)) {
          emailErrorEl.innerText = "⚠️Email 格式錯誤！";

          return false;
      }

      emailErrorEl.innerText = "";

      return true;
  }

  // 只綁定 Email 輸入事件控制地址位移
  emailEl.addEventListener("input", checkEmail);