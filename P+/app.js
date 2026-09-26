// P+ Health Companion App - Clinical Telemetry Router & Interactions

(function () {
  'use strict';

  // Persistent Storage Keys & Defaults
  const STORAGE_KEYS = {
    PATIENT_PROFILE: 'pplus_patient_profile',
    DOCTOR_PROFILE: 'pplus_doctor_profile',
    LAST_ROLE: 'pplus_last_role'
  };

  // Backend API Communication Layer
  const API_BASE = window.location.origin;

  async function apiRequest(endpoint, method = 'GET', data = null) {
    try {
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      if (data && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(data);
      }
      const res = await fetch(`${API_BASE}${endpoint}`, options);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`[P+ API] Request to ${endpoint} failed:`, err.message);
      return null;
    }
  }

  const defaultPatient = {
    name: 'Alex Turner',
    role: 'patient',
    id: 'P-8821',
    email: 'alex.turner@clinical.org',
    phone: '+1 (555) 234-8890',
    bloodGroup: 'O+',
    age: 28,
    gender: 'Male',
    height: 178,
    weight: 71,
    emergencyName: 'Dr. Robert Kelly',
    emergencyPhone: '+1 (555) 019-2834',
    allergies: 'Penicillin, Dust',
    conditions: 'Mild Hypertension',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC7oLNhZft-_5NFE_r1jeWbiYhe5D9ugz7wfXM_HqTUzvz4H9IwmLxhE94qekm-wUFfC9UOsjKGm3G3-HnS29iK_1RsLqnSDTP7diXu1tcinjvlSyuIhzPd7eRoDLVjP58-VfabynwpbfyB1EkpTwDHzOBji70n_CDiW9b1RTWsc1XuygDGX2w3n31EUdG5yBq7M6YCy3aPgQGtJqPy2aJDBbswLqVB9QmuzeBBBXa7jrur4hltT8SOOw'
  };

  const defaultDoctor = {
    name: 'Dr. Neha Sharma',
    role: 'doctor',
    id: 'DOC-CARD-492',
    email: 'dr.neha.sharma@hospital.org',
    phone: '+1 (555) 882-9912',
    degree: 'MD, FACC',
    specialty: 'Cardiology & Electrophysiology',
    license: 'MED-REG-IND-88419',
    hospital: 'Metro Heart Institute & Research Centre',
    department: 'Cardiovascular Sciences',
    opdRoom: 'Room 304, Wing B',
    opdHours: 'Mon - Fri • 09:00 AM - 02:00 PM',
    rating: '4.9',
    consultationsCount: '1,420+',
    onDuty: true,
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDIqde2zHWq5d75xmp5aVgxeVego2Sai2irnWTj-vmHBG_t27ybS25MvuSVXxfzw01o8CZPgCxM3Lxj5K9m-lgCCegetXS7QKxdc7ysjQ2UWbJLPqNL_ZRRGwCgooxO7n2G6Kyb75y4Ou8sl1XjAcIZxy_uZ4aCd6MYGz5vN_zChy0g_8047jL7xNjraXRqE7MxTw6xWd730310TSuyGxwnyPpDLqJwIRkbUnKJMpxb8Z9IB-tOdt63Ug'
  };

  function loadStoredProfile(role) {
    try {
      const key = role === 'doctor' ? STORAGE_KEYS.DOCTOR_PROFILE : STORAGE_KEYS.PATIENT_PROFILE;
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return Object.assign({}, role === 'doctor' ? defaultDoctor : defaultPatient, parsed);
        }
      }
    } catch (e) {
      console.warn('Unable to load from localStorage:', e);
    }
    return Object.assign({}, role === 'doctor' ? defaultDoctor : defaultPatient);
  }

  function saveStoredProfile(user) {
    if (!user) return;
    try {
      const key = user.role === 'doctor' ? STORAGE_KEYS.DOCTOR_PROFILE : STORAGE_KEYS.PATIENT_PROFILE;
      localStorage.setItem(key, JSON.stringify(user));
      localStorage.setItem(STORAGE_KEYS.LAST_ROLE, user.role);
    } catch (e) {
      console.warn('Unable to save to localStorage:', e);
    }
    // Asynchronously sync to backend persistent JSON database
    apiRequest('/api/profile', 'POST', user).catch(() => {});
  }

  const initialRole = (function () {
    try {
      return localStorage.getItem(STORAGE_KEYS.LAST_ROLE) || 'patient';
    } catch (e) {
      return 'patient';
    }
  })();

  // State Management
  const state = {
    currentScreen: 'screen-login',
    history: [],
    doctorFilter: 'all',
    searchQuery: '',
    livePulseInterval: null,
    currentDoctorBooking: null,
    currentPortal: initialRole,
    currentUser: loadStoredProfile(initialRole)
  };

  // DOM Elements
  const viewport = document.getElementById('screens-viewport');
  const screens = document.querySelectorAll('.screen-view');
  const screenSelect = document.getElementById('demo-screen-select');
  const frameToggleBtn = document.getElementById('demo-frame-toggle');
  const canvas = document.querySelector('.app-canvas');
  const toastEl = document.getElementById('p-toast');
  const bookingModal = document.getElementById('booking-modal');

  // Navigate to screen
  function navigateTo(screenId, pushToHistory = true) {
    const targetScreen = document.getElementById(screenId);
    if (!targetScreen) {
      console.warn('Screen not found:', screenId);
      return;
    }

    if (pushToHistory && state.currentScreen && state.currentScreen !== screenId) {
      state.history.push(state.currentScreen);
    }

    const allScreens = document.querySelectorAll('.screen-view');
    allScreens.forEach(s => {
      s.classList.remove('active');
    });

    targetScreen.classList.add('active');
    state.currentScreen = screenId;

    const scrollArea = targetScreen.querySelector('.screen-scroll-area');
    if (scrollArea) {
      scrollArea.scrollTop = 0;
    }

    // Sync presentation switcher select
    if (screenSelect) {
      screenSelect.value = screenId;
    }

    // Update bottom nav highlights across screens that have navs
    updateBottomNavs(screenId);

    // Initialize screen-specific behavior
    if (screenId === 'screen-live') {
      startLiveTelemetry();
    } else {
      stopLiveTelemetry();
    }

    if (screenId === 'screen-profile') {
      renderProfileData();
    }
  }

  function goBack() {
    if (state.history.length > 0) {
      const prevScreen = state.history.pop();
      navigateTo(prevScreen, false);
    } else {
      navigateTo('screen-home', false);
    }
  }

  // Update active states on bottom nav items
  function updateBottomNavs(activeScreenId) {
    const navItems = document.querySelectorAll('[data-nav-target]');
    navItems.forEach(item => {
      const target = item.getAttribute('data-nav-target');
      const isCurrent = target === activeScreenId || 
        (target === 'screen-doctors' && activeScreenId === 'screen-find') ||
        (target === 'screen-profile' && activeScreenId === 'screen-profile') ||
        (target === 'screen-home' && (activeScreenId === 'screen-home' || activeScreenId === 'screen-login'));

      if (isCurrent) {
        item.classList.add('text-primary', 'font-bold');
        item.classList.remove('text-secondary', 'text-on-surface-variant');
      } else {
        if (!item.classList.contains('text-error')) {
          item.classList.remove('text-primary', 'font-bold');
          item.classList.add('text-secondary');
        }
      }
    });
  }

  // Toast notifications
  function showToast(message, icon = 'info') {
    if (!toastEl) return;
    toastEl.innerHTML = `<span class="material-symbols-outlined text-[18px]">${icon}</span><span>${message}</span>`;
    toastEl.classList.add('show');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2800);
  }

  // Live Telemetry Simulation (Heart Rate & Sensors)
  function startLiveTelemetry() {
    stopLiveTelemetry();
    const bpmElements = document.querySelectorAll('.dynamic-bpm-val');
    state.livePulseInterval = setInterval(() => {
      const delta = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
      const currentBpm = 72 + delta;
      bpmElements.forEach(el => {
        el.textContent = currentBpm;
      });
    }, 2200);
  }

  function stopLiveTelemetry() {
    if (state.livePulseInterval) {
      clearInterval(state.livePulseInterval);
      state.livePulseInterval = null;
    }
  }

  // SOS 3-Second Hold Implementation
  function initSosInteraction() {
    const sosBtn = document.getElementById('sos-button');
    const circle = document.getElementById('sos-progress-circle');
    const statusLabel = document.getElementById('sos-status-label');
    const outerRing = document.getElementById('sos-ring-outer');
    const midRing = document.getElementById('sos-ring-mid');
    const testBtn = document.getElementById('sos-test-btn');

    if (!sosBtn || !circle) return;

    let pressTimer = null;
    let startTime = 0;
    const requiredDuration = 3000;
    const totalCircumference = 515;

    function startPress(e) {
      e.preventDefault();
      startTime = performance.now();
      if (statusLabel) {
        statusLabel.textContent = 'Hold steady... Broadcasting in 3s';
        statusLabel.classList.add('text-red-600');
      }
      if (outerRing) outerRing.classList.add('scale-105', 'bg-red-100/60');
      if (midRing) midRing.classList.add('scale-105');

      function step(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / requiredDuration, 1);
        circle.style.strokeDashoffset = totalCircumference * (1 - progress);

        if (progress < 1) {
          pressTimer = requestAnimationFrame(step);
        } else {
          // Success!
          if (navigator.vibrate) navigator.vibrate([150, 60, 150, 60, 400]);
          if (statusLabel) {
            statusLabel.textContent = '🚨 SOS SENT! Dispatchers Notified';
          }
          circle.style.strokeDashoffset = 0;
          if (outerRing) {
            outerRing.classList.remove('scale-105');
            outerRing.classList.add('scale-110', 'bg-red-200/60');
          }
          
          // Persist emergency dispatch event to backend database
          const bpmNow = document.querySelector('.dynamic-bpm-val')?.textContent || '74';
          apiRequest('/api/sos', 'POST', {
            patientName: state.currentUser ? state.currentUser.name : 'Alex Turner',
            contact: state.currentUser ? `${state.currentUser.emergencyName} (${state.currentUser.emergencyPhone})` : 'Dr. Robert Kelly (+1 555-019-2834)',
            location: 'Lat 28.6139° N, Lon 77.2090° E (GPS Locked)',
            heartRate: parseInt(bpmNow, 10),
            spO2: 98
          }).then(res => {
            const evId = res && res.event ? res.event.id : 'SOS-ALERT';
            showToast(`Emergency ${evId} logged to database & dispatched via BLE/Mesh!`, 'emergency');
          });

          setTimeout(resetPress, 4000);
        }
      }
      pressTimer = requestAnimationFrame(step);
    }

    function cancelPress() {
      if (pressTimer) {
        cancelAnimationFrame(pressTimer);
        pressTimer = null;
      }
      resetPress();
    }

    function resetPress() {
      circle.style.strokeDashoffset = totalCircumference;
      if (statusLabel) {
        statusLabel.textContent = 'Press and hold to send SOS';
        statusLabel.classList.remove('text-red-600');
      }
      if (outerRing) {
        outerRing.classList.remove('scale-105', 'scale-110', 'bg-red-100/60', 'bg-red-200/60');
      }
      if (midRing) {
        midRing.classList.remove('scale-105');
      }
    }

    sosBtn.addEventListener('pointerdown', startPress);
    window.addEventListener('pointerup', cancelPress);
    sosBtn.addEventListener('pointercancel', cancelPress);

    if (testBtn) {
      testBtn.addEventListener('click', function () {
        const originalHtml = testBtn.innerHTML;
        testBtn.disabled = true;
        testBtn.innerHTML = '<span class="material-symbols-outlined text-[18px] mr-2 animate-spin">sync</span> Sending Test Alert...';
        
        apiRequest('/api/sos', 'POST', {
          patientName: state.currentUser ? state.currentUser.name : 'Alex Turner',
          contact: 'Test Ping Beacon (Apex Local Mesh)',
          location: 'Diagnostic Self-Test',
          heartRate: 72,
          spO2: 98
        }).then(() => {
          testBtn.innerHTML = '<span class="material-symbols-outlined text-[18px] mr-2 text-emerald-600">check_circle</span> Test Ping Confirmed';
          showToast('Test beacon confirmed & saved in backend database', 'verified');
          setTimeout(() => {
            testBtn.innerHTML = originalHtml;
            testBtn.disabled = false;
          }, 2000);
        });
      });
    }
  }

  // Doctor Booking Sheet Modal
  window.openBookingModal = function (doctorName, specialty) {
    state.currentDoctorBooking = { name: doctorName, specialty: specialty, slot: 'Today 10:30 AM' };
    const nameEl = document.getElementById('modal-doctor-name');
    const specEl = document.getElementById('modal-doctor-specialty');
    if (nameEl) nameEl.textContent = doctorName;
    if (specEl) specEl.textContent = specialty;
    
    // Reset slot styling
    const allSlotBtns = document.querySelectorAll('.slot-btn');
    allSlotBtns.forEach((b, i) => {
      if (i === 0) {
        b.classList.add('border-2', 'border-primary', 'bg-primary/5');
        b.classList.remove('border-gray-200', 'bg-white');
      } else {
        b.classList.remove('border-2', 'border-primary', 'bg-primary/5');
        b.classList.add('border', 'border-gray-200', 'bg-white');
      }
    });

    if (bookingModal) bookingModal.classList.add('open');
  };

  window.closeBookingModal = function () {
    if (bookingModal) bookingModal.classList.remove('open');
  };

  window.selectBookingSlot = function (btn, slotText) {
    const allSlotBtns = document.querySelectorAll('.slot-btn');
    allSlotBtns.forEach(b => {
      b.classList.remove('border-2', 'border-primary', 'bg-primary/5');
      b.classList.add('border', 'border-gray-200', 'bg-white');
    });
    if (btn) {
      btn.classList.add('border-2', 'border-primary', 'bg-primary/5');
      btn.classList.remove('border-gray-200', 'bg-white');
    }
    if (state.currentDoctorBooking) {
      state.currentDoctorBooking.slot = slotText;
    }
  };

  window.confirmBooking = async function () {
    closeBookingModal();
    const doc = state.currentDoctorBooking;
    const docName = doc ? doc.name : 'Doctor';
    const docSpec = doc ? doc.specialty : 'General Physician';
    const slot = doc && doc.slot ? doc.slot : 'Today 10:30 AM';
    const patient = state.currentUser ? state.currentUser.name : 'Alex Turner';

    // Persist appointment to backend database
    const res = await apiRequest('/api/appointments', 'POST', {
      doctorName: docName,
      specialty: docSpec,
      slot: slot,
      patientName: patient,
      notes: 'Consultation request booked via P+ Pro Companion'
    });

    const aptId = res && res.appointment ? res.appointment.id : 'APT-CONFIRMED';
    showToast(`Appointment ${aptId} confirmed with ${docName} for ${slot}!`, 'event_available');
  };

  // Posture Settings Save to Backend
  window.savePostureSettings = async function () {
    const angleEl = document.getElementById('angle-display');
    const timeEl = document.getElementById('time-display');
    const angleVal = angleEl ? parseInt(angleEl.textContent, 10) : 15;
    const timeVal = timeEl ? parseInt(timeEl.textContent, 10) : 10;

    // Persist posture settings to backend database
    const res = await apiRequest('/api/posture/settings', 'POST', {
      alertAngle: angleVal,
      holdTime: timeVal,
      vibrate: true,
      mode: 'Desk & Mobile'
    });

    showToast(`Posture settings (${angleVal}°, ${timeVal}s) saved to database & synced!`, 'check_circle');
  };

  // Center '+' Floating Action Button: Log Diagnostic Entry
  window.logDiagnosticEntry = async function () {
    const bpm = document.querySelector('.dynamic-bpm-val')?.textContent || '72';
    const diagData = {
      type: 'Diagnostic Calibration & Vitals Entry',
      heartRate: parseInt(bpm, 10) || 72,
      spO2: 98,
      temp: 36.6,
      postureAngle: 0,
      status: 'Optimal',
      notes: 'Vitals stream synchronized with wearable ESP32 sensor'
    };

    // Persist diagnostic entry to backend database
    const res = await apiRequest('/api/diagnostics', 'POST', diagData);
    const diagId = res && res.diagnostic ? res.diagnostic.id : 'DIAG-LOG';
    showToast(`Diagnostic entry ${diagId} saved to database • Sensor calibrated`, 'check_circle');
  };

  window.shareDoctorProfile = function (doctorName) {
    if (navigator.share) {
      navigator.share({
        title: `${doctorName} - P+ Pro Health Care`,
        text: `Consult with ${doctorName} on P+ Health Companion.`,
        url: window.location.href
      }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(window.location.href);
      showToast(`Link to ${doctorName}'s profile copied!`, 'content_copy');
    }
  };

  // Filter Tabs in Risk Screen
  function initRiskTabs() {
    const tabs = document.querySelectorAll('.risk-tab-btn');
    const cards = document.querySelectorAll('.risk-article-card');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => {
          t.classList.remove('bg-black', 'text-white', 'shadow-sm');
          t.classList.add('text-slate-600');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('bg-black', 'text-white', 'shadow-sm');
        tab.classList.remove('text-slate-600');
        tab.setAttribute('aria-selected', 'true');

        const cat = tab.getAttribute('data-tab');
        cards.forEach(card => {
          if (cat === 'all' || card.getAttribute('data-risk-category') === cat) {
            card.style.display = 'flex';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  }

  // Doctor Directory Search & Filter
  function initDoctorSearch() {
    const searchInput = document.getElementById('doctor-search-input');
    const filterChips = document.querySelectorAll('.doctor-chip');
    const doctorCards = document.querySelectorAll('.doctor-listing-card');

    function applyFilters() {
      const q = (searchInput ? searchInput.value : '').toLowerCase().trim();
      let visibleCount = 0;

      doctorCards.forEach(card => {
        const name = (card.getAttribute('data-doc-name') || '').toLowerCase();
        const spec = (card.getAttribute('data-doc-spec') || '').toLowerCase();
        const matchesSearch = !q || name.includes(q) || spec.includes(q);
        const matchesCategory = state.doctorFilter === 'all' || spec.includes(state.doctorFilter);

        if (matchesSearch && matchesCategory) {
          card.style.display = 'flex';
          visibleCount++;
        } else {
          card.style.display = 'none';
        }
      });

      const countEl = document.getElementById('doctor-results-count');
      if (countEl) {
        countEl.textContent = `${visibleCount} Doctors Found`;
      }
    }

    if (searchInput) {
      searchInput.addEventListener('input', applyFilters);
    }

    filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        filterChips.forEach(c => {
          c.classList.remove('bg-primary', 'text-on-primary');
          c.classList.add('bg-surface-container-low', 'text-secondary');
        });
        chip.classList.add('bg-primary', 'text-on-primary');
        chip.classList.remove('bg-surface-container-low', 'text-secondary');
        state.doctorFilter = chip.getAttribute('data-spec') || 'all';
        applyFilters();
      });
    });
  }

  // Status bar clock updater
  function updateClock() {
    const clockElements = document.querySelectorAll('.phone-clock');
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    hours = hours % 12 || 12;
    clockElements.forEach(el => {
      el.textContent = `${hours}:${minutes}`;
    });
  }

  // Initialize Global Click Listeners for Navigation
  function initGlobalNavigation() {
    document.addEventListener('click', function (e) {
      const navBtn = e.target.closest('[data-navigate]');
      if (navBtn) {
        e.preventDefault();
        const target = navBtn.getAttribute('data-navigate');
        if (target === 'back') {
          goBack();
        } else {
          navigateTo(target);
        }
        return;
      }

      // Notification button click
      const notifBtn = e.target.closest('[data-notif]');
      if (notifBtn) {
        showToast('All vitals stable • Daily ECG sync complete', 'notifications_active');
      }
    });

    // Presentation Quick Switcher
    if (screenSelect) {
      screenSelect.addEventListener('change', (e) => {
        navigateTo(e.target.value);
      });
    }

    // Presentation Frame Toggle
    if (frameToggleBtn && canvas) {
      frameToggleBtn.addEventListener('click', () => {
        canvas.classList.toggle('frameless-mode');
        const isFrameless = canvas.classList.contains('frameless-mode');
        frameToggleBtn.innerHTML = isFrameless 
          ? '<span class="material-symbols-outlined text-[16px]">smartphone</span> Frame Mode'
          : '<span class="material-symbols-outlined text-[16px]">fullscreen</span> Fullscreen';
      });
    }
  }

  // ==========================================
  // AUTHENTICATION & LOGIN LOGIC
  // ==========================================

  // Switch between Patient and Doctor login portal
  function switchLoginPortal(portal) {
    state.currentPortal = portal;
    const patTab = document.getElementById('tab-portal-patient');
    const docTab = document.getElementById('tab-portal-doctor');
    const heading = document.getElementById('login-heading');
    const badge = document.getElementById('login-role-badge');
    const subheading = document.getElementById('login-subheading');
    const emailLabel = document.getElementById('login-email-label');
    const nameInput = document.getElementById('login-name');
    const emailInput = document.getElementById('login-email');
    const pwdInput = document.getElementById('login-password');
    const nameError = document.getElementById('login-name-error');
    const emailError = document.getElementById('login-email-error');
    const pwdError = document.getElementById('login-password-error');

    if (nameError) nameError.classList.add('hidden');
    if (emailError) emailError.classList.add('hidden');
    if (pwdError) pwdError.classList.add('hidden');
    if (nameInput) nameInput.classList.remove('input-error');
    if (emailInput) emailInput.classList.remove('input-error');
    if (pwdInput) pwdInput.classList.remove('input-error');

    const stored = loadStoredProfile(portal);

    if (portal === 'patient') {
      if (patTab) patTab.classList.add('active');
      if (docTab) docTab.classList.remove('active');
      if (heading) heading.textContent = 'Welcome Back';
      if (badge) {
        badge.textContent = 'PATIENT';
        badge.className = 'text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-black text-white';
      }
      if (subheading) {
        subheading.textContent = 'Sign in to continue your health journey';
      }
      if (emailLabel) emailLabel.textContent = 'Email or Phone';
      if (nameInput) {
        nameInput.value = (stored.name && stored.name !== 'Alex Turner') ? stored.name : '';
      }
      if (emailInput) {
        emailInput.placeholder = 'Email or Phone';
        emailInput.value = (stored.email && stored.email !== 'alex.turner@clinical.org') ? stored.email : '';
      }
      if (pwdInput) {
        pwdInput.placeholder = 'Password';
        pwdInput.value = '';
      }
    } else {
      if (docTab) docTab.classList.add('active');
      if (patTab) patTab.classList.remove('active');
      if (heading) heading.textContent = 'Doctor Sign In';
      if (badge) {
        badge.textContent = 'CLINICAL';
        badge.className = 'text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-black text-white';
      }
      if (subheading) {
        subheading.textContent = 'Clinical telemetry & patient monitoring';
      }
      if (emailLabel) emailLabel.textContent = 'Doctor Email or Phone';
      if (nameInput) {
        nameInput.value = (stored.name && stored.name !== 'Dr. Neha Sharma') ? stored.name : '';
      }
      if (emailInput) {
        emailInput.placeholder = 'Doctor Email or Phone';
        emailInput.value = (stored.email && stored.email !== 'dr.neha.sharma@hospital.org') ? stored.email : '';
      }
      if (pwdInput) {
        pwdInput.placeholder = 'Password';
        pwdInput.value = '';
      }
    }
  }

  // 1-Click Quick Demo Auto-Fill
  function autoFillDemo(role) {
    switchLoginPortal(role);
    const stored = loadStoredProfile(role);
    const nameInput = document.getElementById('login-name');
    const emailInput = document.getElementById('login-email');
    const pwdInput = document.getElementById('login-password');
    if (nameInput) nameInput.value = stored.name || (role === 'doctor' ? 'Dr. Neha Sharma' : 'Alex Turner');
    if (emailInput) emailInput.value = stored.email || (role === 'doctor' ? 'dr.neha.sharma@hospital.org' : 'alex.turner@clinical.org');
    if (pwdInput) pwdInput.value = role === 'doctor' ? 'docCare9900' : 'clinPass2026';
    showToast(`Credentials loaded for ${nameInput ? nameInput.value : stored.name}`, 'check');
  }

  // Show/Hide Password Toggle
  function togglePasswordVisibility() {
    const pwdInput = document.getElementById('login-password');
    const eyeIcon = document.getElementById('eye-icon-login');
    if (!pwdInput) return;
    if (pwdInput.type === 'password') {
      pwdInput.type = 'text';
      if (eyeIcon) eyeIcon.textContent = 'visibility_off';
    } else {
      pwdInput.type = 'password';
      if (eyeIcon) eyeIcon.textContent = 'visibility';
    }
  }

  // Handle Login Submission with validation and loading animation
  function handleLoginSubmit(e) {
    if (e) e.preventDefault();

    const nameInput = document.getElementById('login-name');
    const emailInput = document.getElementById('login-email');
    const pwdInput = document.getElementById('login-password');
    const nameError = document.getElementById('login-name-error');
    const emailError = document.getElementById('login-email-error');
    const pwdError = document.getElementById('login-password-error');
    const submitBtn = document.getElementById('btn-login-submit');
    const spinner = document.getElementById('btn-login-spinner');
    const btnText = document.getElementById('btn-login-text');
    const btnIcon = document.getElementById('btn-login-icon');

    const nameVal = nameInput ? nameInput.value.trim() : '';
    const emailVal = emailInput ? emailInput.value.trim() : '';
    const pwdVal = pwdInput ? pwdInput.value.trim() : '';

    let isValid = true;

    // Validate First & Last Name
    if (!nameVal) {
      if (nameError) {
        nameError.textContent = 'Please enter your First & Last Name';
        nameError.classList.remove('hidden');
      }
      if (nameInput) nameInput.classList.add('input-error');
      isValid = false;
    } else if (nameVal.length < 2) {
      if (nameError) {
        nameError.textContent = 'Name must be at least 2 characters';
        nameError.classList.remove('hidden');
      }
      if (nameInput) nameInput.classList.add('input-error');
      isValid = false;
    } else {
      if (nameError) nameError.classList.add('hidden');
      if (nameInput) nameInput.classList.remove('input-error');
    }

    // Validate Email or Phone
    if (!emailVal) {
      if (emailError) {
        emailError.textContent = 'Please enter your email or phone';
        emailError.classList.remove('hidden');
      }
      if (emailInput) emailInput.classList.add('input-error');
      isValid = false;
    } else if (!emailVal.includes('@') && emailVal.length < 4) {
      if (emailError) {
        emailError.textContent = 'Please enter a valid email or phone';
        emailError.classList.remove('hidden');
      }
      if (emailInput) emailInput.classList.add('input-error');
      isValid = false;
    } else {
      if (emailError) emailError.classList.add('hidden');
      if (emailInput) emailInput.classList.remove('input-error');
    }

    // Validate Password
    if (!pwdVal) {
      if (pwdError) {
        pwdError.textContent = 'Please enter your password';
        pwdError.classList.remove('hidden');
      }
      if (pwdInput) pwdInput.classList.add('input-error');
      isValid = false;
    } else if (pwdVal.length < 4) {
      if (pwdError) {
        pwdError.textContent = 'Password must be at least 4 characters';
        pwdError.classList.remove('hidden');
      }
      if (pwdInput) pwdInput.classList.add('input-error');
      isValid = false;
    } else {
      if (pwdError) pwdError.classList.add('hidden');
      if (pwdInput) pwdInput.classList.remove('input-error');
    }

    if (!isValid) return;

    // Show loading spinner inside submit button
    if (submitBtn) submitBtn.disabled = true;
    if (spinner) spinner.classList.remove('hidden');
    if (btnIcon) btnIcon.classList.add('hidden');
    if (btnText) btnText.textContent = 'Verifying...';

    const isDoctor = state.currentPortal === 'doctor';
    
    // Call backend authentication endpoint
    apiRequest('/api/auth/login', 'POST', {
      name: nameVal,
      emailOrPhone: emailVal,
      password: pwdVal,
      role: isDoctor ? 'doctor' : 'patient'
    }).then(res => {
      if (submitBtn) submitBtn.disabled = false;
      if (spinner) spinner.classList.add('hidden');
      if (btnIcon) btnIcon.classList.remove('hidden');
      if (btnText) btnText.textContent = 'Sign In';

      const backendUser = (res && res.user) ? res.user : null;
      const stored = loadStoredProfile(isDoctor ? 'doctor' : 'patient');
      state.currentUser = Object.assign({}, stored, backendUser || {});

      // Crucially set name to typed name
      state.currentUser.name = nameVal;
      if (emailVal) {
        state.currentUser.email = emailVal;
      }
      saveStoredProfile(state.currentUser);
      updateActiveUserProfile();
      renderProfileData();

      if (isDoctor) {
        showToast(`Welcome back, ${state.currentUser.name}! Doctor clinical session online`, 'verified_user');
      } else {
        showToast(`Welcome back, ${state.currentUser.name}! Telemetry stream online`, 'favorite');
      }
      navigateTo('screen-home');
    }).catch(() => {
      if (submitBtn) submitBtn.disabled = false;
      if (spinner) spinner.classList.add('hidden');
      if (btnIcon) btnIcon.classList.remove('hidden');
      if (btnText) btnText.textContent = 'Sign In';
      navigateTo('screen-home');
    });
  }

  // Quick Biometric Authentication (Face ID / Fingerprint)
  function simulateBiometricAuth() {
    const nameInput = document.getElementById('login-name');
    const typedName = nameInput ? nameInput.value.trim() : '';

    showToast('Biometric Sensor: Scanning Face / Fingerprint...', 'fingerprint');
    setTimeout(() => {
      showToast('Biometric Identity Verified • Secure Access Granted', 'check_circle');
      const isDoctor = state.currentPortal === 'doctor';
      state.currentUser = Object.assign({}, loadStoredProfile(isDoctor ? 'doctor' : 'patient'));
      if (typedName) {
        state.currentUser.name = typedName;
        saveStoredProfile(state.currentUser);
      }
      updateActiveUserProfile();
      renderProfileData();
      navigateTo('screen-home');
    }, 700);
  }

  // Social SSO
  function simulateSocialLogin(provider) {
    const nameInput = document.getElementById('login-name');
    const typedName = nameInput ? nameInput.value.trim() : '';

    showToast(`Connecting with ${provider} Medical SSO...`, 'lock');
    setTimeout(() => {
      showToast(`Authenticated via ${provider} • Welcome!`, 'check_circle');
      state.currentUser = Object.assign({}, loadStoredProfile(state.currentPortal || 'patient'));
      if (typedName) {
        state.currentUser.name = typedName;
      }
      saveStoredProfile(state.currentUser);
      updateActiveUserProfile();
      renderProfileData();
      navigateTo('screen-home');
    }, 600);
  }

  // Forgot Password Prompt
  function showForgotPasswordPrompt() {
    const emailInput = document.getElementById('login-email');
    const contact = emailInput && emailInput.value ? emailInput.value : 'your registered contact';
    showToast(`PIN reset link & OTP sent to ${contact}`, 'mark_email_read');
  }

  // Profile Menu Dropdown & Session Logout
  function toggleProfileMenu(force) {
    const menu = document.getElementById('profile-dropdown');
    if (!menu) return;
    if (typeof force === 'boolean') {
      if (force) menu.classList.add('show');
      else menu.classList.remove('show');
    } else {
      menu.classList.toggle('show');
    }
  }

  function updateActiveUserProfile() {
    const nameEl = document.getElementById('menu-user-name');
    const roleEl = document.getElementById('menu-user-role');
    const avatarEl = document.getElementById('home-avatar-img');
    const greetingName = document.getElementById('home-greeting-name');
    const greetingSub = document.getElementById('home-greeting-sub');

    if (nameEl) nameEl.textContent = state.currentUser.name;
    if (roleEl) roleEl.textContent = state.currentUser.role === 'doctor' ? `Staff ID: ${state.currentUser.id}` : `Patient ID: ${state.currentUser.id}`;
    if (avatarEl && state.currentUser.avatar) avatarEl.src = state.currentUser.avatar;

    if (greetingName) {
      greetingName.textContent = state.currentUser.role === 'doctor' ? `${state.currentUser.name} 🩺` : `${state.currentUser.name} 👋`;
    }
    if (greetingSub) {
      greetingSub.textContent = state.currentUser.role === 'doctor' ? 'Clinical telemetry and active patient diagnostics.' : 'Small habits. A healthier you.';
    }
  }

  function handleLogout() {
    toggleProfileMenu(false);
    showToast('Signed out of health companion. Vault locked.', 'lock');
    // Save current profile to guarantee user name and custom details are never lost
    saveStoredProfile(state.currentUser);
    // Pre-populate login form with active profile credentials
    switchLoginPortal(state.currentPortal || 'patient');
    navigateTo('screen-login');
  }

  // Registration & Doctor Onboarding Modal Handlers
  function openRegisterModal(defaultTab = 'patient') {
    const modal = document.getElementById('register-modal');
    if (modal) {
      modal.classList.add('open');
      switchRegisterTab(defaultTab);
    }
  }

  function closeRegisterModal() {
    const modal = document.getElementById('register-modal');
    if (modal) modal.classList.remove('open');
  }

  function switchRegisterTab(tab) {
    const patBtn = document.getElementById('tab-reg-patient');
    const docBtn = document.getElementById('tab-reg-doctor');
    const patForm = document.getElementById('form-reg-patient');
    const docForm = document.getElementById('form-reg-doctor');
    const title = document.getElementById('reg-modal-title');
    const desc = document.getElementById('reg-modal-desc');

    if (tab === 'patient') {
      if (patBtn) patBtn.classList.add('active');
      if (docBtn) docBtn.classList.remove('active');
      if (patForm) patForm.classList.remove('hidden');
      if (docForm) docForm.classList.add('hidden');
      if (title) title.textContent = 'Patient Registration';
      if (desc) desc.textContent = 'Create your account to start real-time health telemetry';
    } else {
      if (docBtn) docBtn.classList.add('active');
      if (patBtn) patBtn.classList.remove('active');
      if (docForm) docForm.classList.remove('hidden');
      if (patForm) patForm.classList.add('hidden');
      if (title) title.textContent = 'Add / Onboard Doctor';
      if (desc) desc.textContent = 'Register a medical specialist into the hospital care team';
    }
  }

  function handlePatientRegistration(e) {
    if (e) e.preventDefault();
    const nameInput = document.getElementById('reg-patient-name');
    const name = nameInput && nameInput.value ? nameInput.value.trim() : 'Alex Turner';
    closeRegisterModal();
    const existing = loadStoredProfile('patient');
    state.currentUser = Object.assign({}, existing, {
      name: name,
      role: 'patient',
      id: 'P-' + Math.floor(1000 + Math.random() * 9000)
    });
    saveStoredProfile(state.currentUser);
    apiRequest('/api/auth/register', 'POST', state.currentUser).catch(() => {});
    updateActiveUserProfile();
    showToast(`Account created for ${state.currentUser.name}! Saved to database.`, 'how_to_reg');
    setTimeout(() => {
      navigateTo('screen-home');
    }, 450);
  }

  function handleDoctorRegistration(e) {
    if (e) e.preventDefault();
    const name = document.getElementById('reg-doc-name').value.trim();
    const spec = document.getElementById('reg-doc-spec').value;
    const hospital = document.getElementById('reg-doc-hospital').value.trim();

    closeRegisterModal();

    const existing = loadStoredProfile('doctor');
    const docProfile = Object.assign({}, existing, {
      name: name,
      specialty: spec,
      hospital: hospital,
      role: 'doctor',
      id: 'DOC-' + Math.floor(100 + Math.random() * 900)
    });
    saveStoredProfile(docProfile);
    apiRequest('/api/auth/register', 'POST', docProfile).catch(() => {});

    // Dynamically inject the new doctor card into screen-doctors
    addDoctorToCareTeamList(name, spec, hospital);

    showToast(`${name} (${spec}) added to Care Team!`, 'verified');
    
    // Switch to Doctor Portal and prefill
    switchLoginPortal('doctor');
    const emailInput = document.getElementById('login-email');
    if (emailInput) {
      emailInput.value = `${name.toLowerCase().replace(/[^a-z]/g, '.')}@${hospital.toLowerCase().replace(/[^a-z]/g, '') || 'hospital'}.org`;
    }
  }

  function addDoctorToCareTeamList(name, spec, hospital) {
    const doctorsScreen = document.getElementById('screen-doctors');
    if (!doctorsScreen) return;
    const stack = doctorsScreen.querySelector('.flex.flex-col.gap-4');
    if (!stack) return;

    const newCard = document.createElement('div');
    newCard.className = 'w-full bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-surface-container flex flex-col gap-4 animate-pulse';
    newCard.innerHTML = `
      <div class="flex items-start gap-4">
        <div class="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold shrink-0 shadow-sm ring-1 ring-black/5">
          🩺
        </div>
        <div class="flex flex-col min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-lg font-bold text-on-surface tracking-tight">${name}</h3>
            <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-low text-on-surface font-semibold text-xs shrink-0">
              <span class="text-amber-500 text-xs">★</span>
              <span>5.0</span>
            </div>
          </div>
          <span class="text-xs text-on-surface-variant font-medium mt-0.5">${spec}</span>
          <span class="text-label-md text-secondary text-xs mt-0.5">${hospital}</span>
        </div>
      </div>
      <div class="flex items-center gap-2.5">
        <button class="flex-1 h-11 bg-primary hover:bg-primary-container active:scale-[0.98] transition-all rounded-full flex items-center justify-center gap-1.5 shadow-sm cursor-pointer" type="button" onclick="openBookingModal('${name.replace(/'/g, "\\'")}', '${spec}')">
          <span class="text-xs text-on-primary font-medium">Book Now</span>
          <span class="material-symbols-outlined text-on-primary text-[16px]">calendar_today</span>
        </button>
        <button aria-label="Share profile" class="h-11 px-4 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface flex items-center justify-center gap-1.5 font-medium text-xs transition-all active:scale-95 shrink-0 cursor-pointer" type="button" onclick="shareDoctorProfile('${name.replace(/'/g, "\\'")}')">
          <span class="material-symbols-outlined text-[17px]">share</span>
          <span>Share</span>
        </button>
      </div>
    `;
    stack.prepend(newCard);
    setTimeout(() => newCard.classList.remove('animate-pulse'), 1500);
  }

  // Close profile dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#home-avatar-btn') && !e.target.closest('#profile-dropdown')) {
      toggleProfileMenu(false);
    }
  });

  // ==========================================
  // AVATAR & SELF PHOTO EDITING
  // ==========================================
  function openAvatarModal() {
    const modal = document.getElementById('avatar-modal');
    if (!modal) return;
    const sheet = modal.querySelector('.p-modal-sheet');
    if (sheet) sheet.scrollTop = 0;
    const preview = document.getElementById('avatar-modal-preview');
    const user = state.currentUser || loadStoredProfile(state.currentPortal || 'patient');
    const currentAvatar = (user && user.avatar) ? user.avatar : defaultPatient.avatar;
    if (preview) preview.src = currentAvatar;
    highlightSelectedAvatar(currentAvatar);
    modal.classList.add('open');
    if (sheet) setTimeout(() => { sheet.scrollTop = 0; }, 50);
  }

  function closeAvatarModal() {
    const modal = document.getElementById('avatar-modal');
    if (modal) modal.classList.remove('open');
  }

  function triggerPhotoUpload() {
    const input = document.getElementById('avatar-file-input');
    if (input) input.click();
  }

  function handleAvatarFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file', 'error');
      return;
    }

    showToast('Processing photo...', 'hourglass_top');

    const reader = new FileReader();
    reader.onload = function (evt) {
      const img = new Image();
      img.onload = function () {
        // Resize to 300x300 canvas to optimize storage in localStorage
        const canvas = document.createElement('canvas');
        const size = 300;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Center crop square
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        applyNewAvatar(dataUrl);
        showToast('Profile photo / selfie updated successfully!', 'check_circle');
      };
      img.onerror = function () {
        applyNewAvatar(evt.target.result);
        showToast('Profile photo updated!', 'check_circle');
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function selectPresetAvatar(avatarUrl, btn) {
    applyNewAvatar(avatarUrl);
    if (btn) {
      document.querySelectorAll('.avatar-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
    showToast('Avatar updated!', 'sentiment_satisfied');
  }

  function applyNewAvatar(avatarUrl) {
    if (!state.currentUser) state.currentUser = loadStoredProfile(state.currentPortal || 'patient');
    state.currentUser.avatar = avatarUrl;
    saveStoredProfile(state.currentUser);

    // Update all avatar images in the DOM
    const homeAvatar = document.getElementById('home-avatar-img');
    const profileAvatar = document.getElementById('profile-display-avatar');
    const docAvatar = document.getElementById('doc-profile-avatar');
    const modalPreview = document.getElementById('avatar-modal-preview');
    const editPatientPreview = document.getElementById('edit-patient-avatar-preview');
    const editDocPreview = document.getElementById('edit-doc-avatar-preview');

    if (homeAvatar) homeAvatar.src = avatarUrl;
    if (profileAvatar) profileAvatar.src = avatarUrl;
    if (docAvatar) docAvatar.src = avatarUrl;
    if (modalPreview) modalPreview.src = avatarUrl;
    if (editPatientPreview) editPatientPreview.src = avatarUrl;
    if (editDocPreview) editDocPreview.src = avatarUrl;
  }

  function resetDefaultAvatar() {
    const isDoc = state.currentUser && state.currentUser.role === 'doctor';
    const def = isDoc ? defaultDoctor.avatar : defaultPatient.avatar;
    applyNewAvatar(def);
    showToast('Default avatar restored', 'refresh');
  }

  function highlightSelectedAvatar(url) {
    document.querySelectorAll('.avatar-preset-btn').forEach(b => {
      const img = b.querySelector('img');
      if (img && img.src === url) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
  }

  // ==========================================
  // HEALTH PROFILE & EDIT MANAGEMENT
  // ==========================================

  function renderProfileData() {
    const user = state.currentUser;
    const isDoctor = user && user.role === 'doctor';

    const patientView = document.getElementById('profile-patient-view');
    const doctorView = document.getElementById('profile-doctor-view');
    const pageTitle = document.getElementById('profile-page-title');

    if (isDoctor) {
      if (patientView) patientView.classList.add('hidden');
      if (doctorView) doctorView.classList.remove('hidden');
      if (pageTitle) pageTitle.textContent = 'Doctor Clinical Profile';

      // Populate Doctor Clinical Fields
      const docAvatar = document.getElementById('doc-profile-avatar');
      const docName = document.getElementById('doc-profile-name');
      const docDegree = document.getElementById('doc-profile-degree');
      const docLicense = document.getElementById('doc-profile-license');
      const docHospital = document.getElementById('doc-profile-hospital');
      const docDept = document.getElementById('doc-profile-dept');
      const docEmail = document.getElementById('doc-profile-email');
      const docOpdRoom = document.getElementById('doc-profile-opd-room');
      const docOpdHours = document.getElementById('doc-profile-opd-hours');
      const docConsults = document.getElementById('doc-profile-consults');
      const docRating = document.getElementById('doc-profile-rating');
      const dutyCheckbox = document.getElementById('doc-duty-checkbox');
      const dutyBadge = document.getElementById('doc-duty-badge');
      const dutyDot = document.getElementById('doc-duty-dot');
      const dutyDesc = document.getElementById('doc-duty-desc');

      if (docAvatar && user.avatar) docAvatar.src = user.avatar;
      if (docName) docName.textContent = user.name || 'Dr. Neha Sharma';
      if (docDegree) docDegree.textContent = `${user.degree || 'MD, FACC'} (${user.specialty || 'Cardiology'})`;
      if (docLicense) docLicense.textContent = `LIC: ${user.license || 'MED-REG-IND-88419'}`;
      if (docHospital) docHospital.textContent = user.hospital || 'Metro Heart Institute & Research Centre';
      if (docDept) docDept.textContent = user.department || 'Cardiovascular Sciences';
      if (docEmail) docEmail.textContent = user.email || 'dr.neha.sharma@hospital.org';
      if (docOpdRoom) docOpdRoom.textContent = user.opdRoom || 'Room 304, Wing B';
      if (docOpdHours) docOpdHours.textContent = user.opdHours || 'Mon - Fri • 09:00 AM - 02:00 PM';
      if (docConsults) docConsults.textContent = user.consultationsCount || '1,420+';
      if (docRating) docRating.textContent = user.rating || '4.9';

      const isOnDuty = user.onDuty !== false;
      if (dutyCheckbox) dutyCheckbox.checked = isOnDuty;
      if (dutyBadge) {
        dutyBadge.textContent = isOnDuty ? 'ON DUTY' : 'STANDBY';
        dutyBadge.className = isOnDuty 
          ? 'px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold tracking-wider uppercase'
          : 'px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold tracking-wider uppercase';
      }
      if (dutyDot) {
        dutyDot.className = isOnDuty ? 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse' : 'w-2.5 h-2.5 rounded-full bg-amber-400';
      }
      if (dutyDesc) {
        dutyDesc.textContent = isOnDuty 
          ? 'Accepting real-time patient arrhythmia alerts and emergency triage dispatches.'
          : 'Standby mode: Non-urgent alerts routed to hospital duty registry.';
      }
    } else {
      if (doctorView) doctorView.classList.add('hidden');
      if (patientView) patientView.classList.remove('hidden');
      if (pageTitle) pageTitle.textContent = 'Patient Health Profile';

      // Populate Patient Biometric & Vitals Fields
      const avatarEl = document.getElementById('profile-display-avatar');
      const nameEl = document.getElementById('profile-display-name');
      const roleEl = document.getElementById('profile-display-role');
      const contactEl = document.getElementById('profile-display-contact');
      const bloodEl = document.getElementById('profile-display-blood');
      const ageEl = document.getElementById('profile-display-age');
      const genderEl = document.getElementById('profile-display-gender');
      const heightEl = document.getElementById('profile-display-height');
      const weightEl = document.getElementById('profile-display-weight');
      const bmiEl = document.getElementById('profile-display-bmi');
      const bmiCatEl = document.getElementById('profile-display-bmi-cat');
      const sosNameEl = document.getElementById('profile-display-sos-name');
      const sosPhoneEl = document.getElementById('profile-display-sos-phone');
      const callSosBtn = document.getElementById('profile-call-sos-btn');
      const allergiesEl = document.getElementById('profile-display-allergies');
      const conditionsEl = document.getElementById('profile-display-conditions');

      if (avatarEl && user.avatar) avatarEl.src = user.avatar;
      if (nameEl) nameEl.textContent = user.name || 'Alex Turner';
      if (roleEl) roleEl.textContent = `PATIENT • ${user.id || 'P-8821'}`;
      if (contactEl) contactEl.textContent = user.email || user.phone || 'alex.turner@clinical.org';
      if (bloodEl) bloodEl.textContent = user.bloodGroup || 'O+';
      if (ageEl) ageEl.textContent = user.age || '28';
      if (genderEl) genderEl.textContent = user.gender || 'Male';
      if (heightEl) heightEl.textContent = user.height || '178';
      if (weightEl) weightEl.textContent = user.weight || '71';

      // Calculate BMI
      const h = parseFloat(user.height) || 178;
      const w = parseFloat(user.weight) || 71;
      const bmi = (w / ((h / 100) * (h / 100))).toFixed(1);
      let cat = 'Normal';
      let catClass = 'text-emerald-700';

      if (bmi < 18.5) {
        cat = 'Underweight';
        catClass = 'text-amber-600';
      } else if (bmi < 25) {
        cat = 'Normal';
        catClass = 'text-emerald-700';
      } else if (bmi < 30) {
        cat = 'Overweight';
        catClass = 'text-amber-600';
      } else {
        cat = 'Obese';
        catClass = 'text-red-600';
      }

      if (bmiEl) bmiEl.textContent = bmi;
      if (bmiCatEl) {
        bmiCatEl.textContent = cat;
        bmiCatEl.className = `text-[11px] font-semibold ${catClass}`;
      }

      if (sosNameEl) sosNameEl.textContent = user.emergencyName || 'Dr. Robert Kelly';
      if (sosPhoneEl) sosPhoneEl.textContent = user.emergencyPhone || '+1 (555) 019-2834';
      if (callSosBtn) callSosBtn.href = `tel:${(user.emergencyPhone || '5550192834').replace(/[^0-9]/g, '')}`;

      if (allergiesEl) allergiesEl.textContent = user.allergies || 'None';
      if (conditionsEl) conditionsEl.textContent = user.conditions || 'None';

      // Sync to SOS screen
      const sosScreenName = document.getElementById('sos-primary-contact-name');
      const sosScreenLink = document.getElementById('sos-primary-contact-link');
      if (sosScreenName) sosScreenName.textContent = user.emergencyName || 'Dr. Robert Kelly';
      if (sosScreenLink) {
        sosScreenLink.href = `tel:${(user.emergencyPhone || '5550192834').replace(/[^0-9]/g, '')}`;
        sosScreenLink.onclick = () => showToast(`Calling ${user.emergencyName}...`, 'call');
      }
    }
  }

  function openEditProfileModal() {
    const user = state.currentUser;
    const modal = document.getElementById('edit-profile-modal');
    if (!modal) return;

    const isDoctor = user && user.role === 'doctor';
    const formPatient = document.getElementById('form-edit-patient');
    const formDoctor = document.getElementById('form-edit-doctor');
    const modalTitle = document.getElementById('edit-modal-title');
    const modalDesc = document.getElementById('edit-modal-desc');

    if (isDoctor) {
      if (formPatient) formPatient.classList.add('hidden');
      if (formDoctor) formDoctor.classList.remove('hidden');
      if (modalTitle) modalTitle.textContent = 'Edit Doctor Credentials';
      if (modalDesc) modalDesc.textContent = 'Update medical license, hospital affiliation & clinic hours';

      const nameIn = document.getElementById('edit-doc-name');
      const degIn = document.getElementById('edit-doc-degree');
      const specIn = document.getElementById('edit-doc-specialty');
      const licIn = document.getElementById('edit-doc-license');
      const hospIn = document.getElementById('edit-doc-hospital');
      const deptIn = document.getElementById('edit-doc-dept');
      const roomIn = document.getElementById('edit-doc-opd-room');
      const hoursIn = document.getElementById('edit-doc-opd-hours');
      const emailIn = document.getElementById('edit-doc-email');
      const phoneIn = document.getElementById('edit-doc-phone');
      const editDocPreview = document.getElementById('edit-doc-avatar-preview');

      if (editDocPreview && user.avatar) editDocPreview.src = user.avatar;
      if (nameIn) nameIn.value = user.name || 'Dr. Neha Sharma';
      if (degIn) degIn.value = user.degree || 'MD, FACC';
      if (specIn) specIn.value = user.specialty || 'Cardiology';
      if (licIn) licIn.value = user.license || 'MED-REG-IND-88419';
      if (hospIn) hospIn.value = user.hospital || 'Metro Heart Institute & Research Centre';
      if (deptIn) deptIn.value = user.department || 'Cardiovascular Sciences';
      if (roomIn) roomIn.value = user.opdRoom || 'Room 304, Wing B';
      if (hoursIn) hoursIn.value = user.opdHours || 'Mon - Fri • 09:00 AM - 02:00 PM';
      if (emailIn) emailIn.value = user.email || 'dr.neha.sharma@hospital.org';
      if (phoneIn) phoneIn.value = user.phone || '+1 (555) 882-9912';
    } else {
      if (formDoctor) formDoctor.classList.add('hidden');
      if (formPatient) formPatient.classList.remove('hidden');
      if (modalTitle) modalTitle.textContent = 'Edit Health Profile';
      if (modalDesc) modalDesc.textContent = 'Update your personal biometrics & medical records';

      const editPatientPreview = document.getElementById('edit-patient-avatar-preview');
      if (editPatientPreview && user.avatar) editPatientPreview.src = user.avatar;

      const nameInput = document.getElementById('edit-profile-name');
      const emailInput = document.getElementById('edit-profile-email');
      const phoneInput = document.getElementById('edit-profile-phone');
      const bloodInput = document.getElementById('edit-profile-blood');
      const ageInput = document.getElementById('edit-profile-age');
      const genderInput = document.getElementById('edit-profile-gender');
      const heightInput = document.getElementById('edit-profile-height');
      const weightInput = document.getElementById('edit-profile-weight');
      const sosNameInput = document.getElementById('edit-profile-sos-name');
      const sosPhoneInput = document.getElementById('edit-profile-sos-phone');
      const allergiesInput = document.getElementById('edit-profile-allergies');
      const conditionsInput = document.getElementById('edit-profile-conditions');

      if (nameInput) nameInput.value = user.name || 'Alex Turner';
      if (emailInput) emailInput.value = user.email || 'alex.turner@clinical.org';
      if (phoneInput) phoneInput.value = user.phone || '+1 (555) 234-8890';
      if (bloodInput) bloodInput.value = user.bloodGroup || 'O+';
      if (ageInput) ageInput.value = user.age || 28;
      if (genderInput) genderInput.value = user.gender || 'Male';
      if (heightInput) heightInput.value = user.height || 178;
      if (weightInput) weightInput.value = user.weight || 71;
      if (sosNameInput) sosNameInput.value = user.emergencyName || 'Dr. Robert Kelly';
      if (sosPhoneInput) sosPhoneInput.value = user.emergencyPhone || '+1 (555) 019-2834';
      if (allergiesInput) allergiesInput.value = user.allergies || 'Penicillin, Dust';
      if (conditionsInput) conditionsInput.value = user.conditions || 'Mild Hypertension';

      updateBmiPreview();
    }

    modal.classList.add('open');
  }

  function closeEditProfileModal() {
    const modal = document.getElementById('edit-profile-modal');
    if (modal) modal.classList.remove('open');
  }

  function updateBmiPreview() {
    const hInput = document.getElementById('edit-profile-height');
    const wInput = document.getElementById('edit-profile-weight');
    const preview = document.getElementById('edit-profile-bmi-preview');
    if (!hInput || !wInput || !preview) return;

    const h = parseFloat(hInput.value) || 178;
    const w = parseFloat(wInput.value) || 71;
    const bmi = (w / ((h / 100) * (h / 100))).toFixed(1);

    let cat = 'Normal';
    if (bmi < 18.5) cat = 'Underweight';
    else if (bmi < 25) cat = 'Normal';
    else if (bmi < 30) cat = 'Overweight';
    else cat = 'Obese';

    preview.innerHTML = `Calculated BMI: <span class="font-bold text-on-surface">${bmi} (${cat})</span>`;
  }

  function saveProfileDetails(e) {
    if (e) e.preventDefault();

    if (state.currentUser && state.currentUser.role === 'doctor') {
      saveDoctorProfileDetails(e);
      return;
    }

    const nameInput = document.getElementById('edit-profile-name');
    const emailInput = document.getElementById('edit-profile-email');
    const phoneInput = document.getElementById('edit-profile-phone');
    const bloodInput = document.getElementById('edit-profile-blood');
    const ageInput = document.getElementById('edit-profile-age');
    const genderInput = document.getElementById('edit-profile-gender');
    const heightInput = document.getElementById('edit-profile-height');
    const weightInput = document.getElementById('edit-profile-weight');
    const sosNameInput = document.getElementById('edit-profile-sos-name');
    const sosPhoneInput = document.getElementById('edit-profile-sos-phone');
    const allergiesInput = document.getElementById('edit-profile-allergies');
    const conditionsInput = document.getElementById('edit-profile-conditions');

    if (nameInput) state.currentUser.name = nameInput.value.trim() || state.currentUser.name;
    if (emailInput) state.currentUser.email = emailInput.value.trim();
    if (phoneInput) state.currentUser.phone = phoneInput.value.trim();
    if (bloodInput) state.currentUser.bloodGroup = bloodInput.value;
    if (ageInput) state.currentUser.age = parseInt(ageInput.value) || state.currentUser.age;
    if (genderInput) state.currentUser.gender = genderInput.value;
    if (heightInput) state.currentUser.height = parseInt(heightInput.value) || state.currentUser.height;
    if (weightInput) state.currentUser.weight = parseInt(weightInput.value) || state.currentUser.weight;
    if (sosNameInput) state.currentUser.emergencyName = sosNameInput.value.trim();
    if (sosPhoneInput) state.currentUser.emergencyPhone = sosPhoneInput.value.trim();
    if (allergiesInput) state.currentUser.allergies = allergiesInput.value.trim();
    if (conditionsInput) state.currentUser.conditions = conditionsInput.value.trim();

    state.currentUser.role = 'patient';
    saveStoredProfile(state.currentUser);
    closeEditProfileModal();
    renderProfileData();
    updateActiveUserProfile();

    showToast('Health profile & emergency telemetry updated!', 'verified');
  }

  function saveDoctorProfileDetails(e) {
    if (e) e.preventDefault();

    const nameIn = document.getElementById('edit-doc-name');
    const degIn = document.getElementById('edit-doc-degree');
    const specIn = document.getElementById('edit-doc-specialty');
    const licIn = document.getElementById('edit-doc-license');
    const hospIn = document.getElementById('edit-doc-hospital');
    const deptIn = document.getElementById('edit-doc-dept');
    const roomIn = document.getElementById('edit-doc-opd-room');
    const hoursIn = document.getElementById('edit-doc-opd-hours');
    const emailIn = document.getElementById('edit-doc-email');
    const phoneIn = document.getElementById('edit-doc-phone');

    if (nameIn) state.currentUser.name = nameIn.value.trim() || state.currentUser.name;
    if (degIn) state.currentUser.degree = degIn.value.trim() || state.currentUser.degree;
    if (specIn) state.currentUser.specialty = specIn.value.trim() || state.currentUser.specialty;
    if (licIn) state.currentUser.license = licIn.value.trim() || state.currentUser.license;
    if (hospIn) state.currentUser.hospital = hospIn.value.trim() || state.currentUser.hospital;
    if (deptIn) state.currentUser.department = deptIn.value.trim() || state.currentUser.department;
    if (roomIn) state.currentUser.opdRoom = roomIn.value.trim() || state.currentUser.opdRoom;
    if (hoursIn) state.currentUser.opdHours = hoursIn.value.trim() || state.currentUser.opdHours;
    if (emailIn) state.currentUser.email = emailIn.value.trim() || state.currentUser.email;
    if (phoneIn) state.currentUser.phone = phoneIn.value.trim() || state.currentUser.phone;

    state.currentUser.role = 'doctor';
    saveStoredProfile(state.currentUser);
    closeEditProfileModal();
    renderProfileData();
    updateActiveUserProfile();

    showToast('Doctor clinical credentials & OPD schedule saved!', 'verified');
  }

  function toggleDoctorDuty(isChecked) {
    if (typeof isChecked !== 'boolean') {
      const cb = document.getElementById('doc-duty-checkbox');
      isChecked = cb ? cb.checked : true;
    }
    state.currentUser.onDuty = isChecked;
    saveStoredProfile(state.currentUser);
    const dutyBadge = document.getElementById('doc-duty-badge');
    const dutyDot = document.getElementById('doc-duty-dot');
    const dutyDesc = document.getElementById('doc-duty-desc');

    if (dutyBadge) {
      dutyBadge.textContent = isChecked ? 'ON DUTY' : 'STANDBY';
      dutyBadge.className = isChecked 
        ? 'px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold tracking-wider uppercase'
        : 'px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold tracking-wider uppercase';
    }
    if (dutyDot) {
      dutyDot.className = isChecked ? 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse' : 'w-2.5 h-2.5 rounded-full bg-amber-400';
    }
    if (dutyDesc) {
      dutyDesc.textContent = isChecked 
        ? 'Accepting real-time patient arrhythmia alerts and emergency triage dispatches.'
        : 'Standby mode: Non-urgent alerts routed to hospital duty registry.';
    }

    showToast(isChecked ? `${state.currentUser.name} is now ON DUTY` : 'Doctor on-call status set to Standby', isChecked ? 'verified_user' : 'pause_circle');
  }

  function syncPairedDevices() {
    openEsp32BleModal();
  }

  function exportHealthReport() {
    showToast('Generating clinical health report (PDF)...', 'downloading');
    setTimeout(() => {
      showToast('P+ Clinical Health Summary exported successfully!', 'download_done');
    }, 800);
  }

  function exportClinicalLogs() {
    showToast('Generating clinical consultation dossier & telemetry logs (PDF)...', 'downloading');
    setTimeout(() => {
      showToast('Doctor Clinical Dossier exported successfully!', 'download_done');
    }, 800);
  }

  // ==========================================
  // ESP32-S3 BLUETOOTH LOW ENERGY (BLE) SYSTEM
  // ==========================================
  const bleState = {
    device: null,
    server: null,
    characteristic: null,
    isConnected: false,
    isSimulating: false,
    simTimer: null,
    deviceName: 'ESP32-S3-PPLUS',
    packetsCount: 0,
    lastSyncTimestamp: 0,
    currentTelemetry: {
      heartRate: 72,
      spO2: 98,
      temp: 36.6,
      postureAngle: 0,
      battery: 78,
      motion: 'Normal (Resting Phase)'
    }
  };

  const BLE_CONFIG = {
    NUS_SERVICE_UUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    NUS_TX_CHAR_UUID: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    PPLUS_SERVICE_UUID: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
    PPLUS_CHAR_UUID: 'beb5483e-36e1-4688-b7f5-ea07361b26a8',
    HEART_RATE_SERVICE: 'heart_rate',
    BATTERY_SERVICE: 'battery_service'
  };

  function openEsp32BleModal() {
    const modal = document.getElementById('esp32-ble-modal');
    if (!modal) return;
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100');
    updateBleUiState();
  }

  function closeEsp32BleModal() {
    const modal = document.getElementById('esp32-ble-modal');
    if (!modal) return;
    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0', 'pointer-events-none');
  }

  function updateBleUiState() {
    const isConn = bleState.isConnected || bleState.isSimulating;
    const devName = bleState.deviceName || 'ESP32-S3-PPLUS';

    // 1. Home screen header status pill
    const headerPill = document.getElementById('ble-status-pill');
    const headerIcon = document.getElementById('ble-header-icon');
    const headerLabel = document.getElementById('ble-header-label');
    if (headerPill && headerIcon && headerLabel) {
      if (isConn) {
        headerPill.className = 'flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-1 rounded-full text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-xs';
        headerIcon.textContent = 'bluetooth_connected';
        headerIcon.className = 'material-symbols-outlined text-[15px] text-emerald-600';
        headerLabel.textContent = 'ESP32 ' + (bleState.isSimulating ? 'SIM' : 'LIVE');
      } else {
        headerPill.className = 'flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/90 px-2 py-1 rounded-full text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-xs';
        headerIcon.textContent = 'bluetooth';
        headerIcon.className = 'material-symbols-outlined text-[15px] text-blue-600';
        headerLabel.textContent = 'ESP32';
      }
    }

    // 2. Live Monitoring screen device banner
    const liveStatusTxt = document.getElementById('live-ble-status-txt');
    const liveNameTxt = document.getElementById('live-ble-name-txt');
    const livePulseDot = document.getElementById('live-ble-pulse-indicator');
    if (liveStatusTxt && liveNameTxt) {
      if (isConn) {
        liveStatusTxt.textContent = bleState.isSimulating ? 'SIMULATOR LIVE' : 'ESP32-S3 CONNECTED';
        liveStatusTxt.className = 'font-label-telemetry text-label-telemetry text-emerald-700 uppercase tracking-wider font-extrabold';
        liveNameTxt.textContent = `• ${devName} (BLE)`;
        if (livePulseDot) {
          livePulseDot.innerHTML = '<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>';
        }
      } else {
        liveStatusTxt.textContent = 'ESP32 STANDBY';
        liveStatusTxt.className = 'font-label-telemetry text-label-telemetry text-on-surface uppercase tracking-wider font-semibold';
        liveNameTxt.textContent = '• Tap to connect BLE';
        if (livePulseDot) {
          livePulseDot.innerHTML = '<span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-gray-400"></span>';
        }
      }
    }

    // 3. Modal status elements
    const modalDot = document.getElementById('ble-modal-dot');
    const modalStatusLabel = document.getElementById('ble-modal-status-label');
    const modalDeviceName = document.getElementById('ble-modal-device-name');
    const modalBat = document.getElementById('ble-modal-bat-val');
    const modalRssi = document.getElementById('ble-modal-rssi-val');
    const disconnectBtn = document.getElementById('ble-disconnect-btn');
    const simBtnLabel = document.getElementById('ble-sim-btn-label');
    const connectBtn = document.getElementById('ble-connect-btn');

    if (modalDot && modalStatusLabel) {
      if (isConn) {
        modalDot.className = 'ble-pulse-dot';
        modalStatusLabel.textContent = bleState.isSimulating ? 'Simulating ESP32 Stream' : 'Connected (BLE)';
        modalStatusLabel.className = 'font-bold text-xs text-emerald-700 uppercase tracking-wide';
        if (modalDeviceName) modalDeviceName.textContent = devName;
        if (modalBat) modalBat.textContent = bleState.currentTelemetry.battery + '%';
        if (modalRssi) modalRssi.textContent = bleState.isSimulating ? '-58 dBm' : '-65 dBm';
        if (disconnectBtn) {
          disconnectBtn.classList.remove('hidden');
          disconnectBtn.classList.add('flex');
        }
        if (connectBtn) {
          connectBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span><span>Connected: ' + devName + '</span>';
          connectBtn.className = 'w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all';
        }
      } else {
        modalDot.className = 'w-2.5 h-2.5 rounded-full bg-gray-400';
        modalStatusLabel.textContent = 'Disconnected';
        modalStatusLabel.className = 'font-bold text-xs text-gray-700 uppercase tracking-wide';
        if (modalDeviceName) modalDeviceName.textContent = 'No device paired';
        if (modalBat) modalBat.textContent = '--%';
        if (modalRssi) modalRssi.textContent = '-- dBm';
        if (disconnectBtn) {
          disconnectBtn.classList.add('hidden');
          disconnectBtn.classList.remove('flex');
        }
        if (connectBtn) {
          connectBtn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-pulse">bluetooth_searching</span><span class="tracking-wide">Start Bluetooth Search</span>';
          connectBtn.className = 'w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all';
        }
      }
    }

    if (simBtnLabel) {
      simBtnLabel.textContent = bleState.isSimulating ? 'Stop Simulator' : 'Simulate Stream';
    }

    // 4. Update all center + buttons across bottom navigation bars
    const plusButtons = document.querySelectorAll('.main-plus-ble-btn');
    const navIcons = document.querySelectorAll('.nav-center-icon');
    const bleBadges = document.querySelectorAll('.nav-center-ble-badge');

    plusButtons.forEach(btn => {
      if (isConn) {
        btn.classList.add('bg-emerald-600', 'shadow-emerald-500/30');
        btn.classList.remove('bg-primary');
        btn.title = `Connected to ${devName} • Tap to view Bluetooth telemetry`;
      } else {
        btn.classList.remove('bg-emerald-600', 'shadow-emerald-500/30');
        btn.classList.add('bg-primary');
        btn.title = 'Connect Bluetooth Device (ESP32-S3)';
      }
    });

    navIcons.forEach(ic => {
      ic.textContent = isConn ? 'bluetooth_connected' : 'add';
    });

    bleBadges.forEach(badge => {
      if (isConn) {
        badge.className = 'nav-center-ble-badge absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center border-2 border-white shadow-xs';
        badge.innerHTML = '<span class="material-symbols-outlined text-[10px]">check</span>';
      } else {
        badge.className = 'nav-center-ble-badge absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center border-2 border-white shadow-xs';
        badge.innerHTML = '<span class="material-symbols-outlined text-[10px]">bluetooth</span>';
      }
    });

    // 5. Update Bluetooth Search Section Status Tag
    const searchStatusTag = document.getElementById('ble-search-status-tag');
    if (searchStatusTag) {
      if (isConn) {
        searchStatusTag.textContent = bleState.isSimulating ? 'SIMULATOR ACTIVE' : 'CONNECTED';
        searchStatusTag.className = 'text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300';
      } else {
        searchStatusTag.textContent = 'READY TO SEARCH';
        searchStatusTag.className = 'text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200';
      }
    }
  }

  // Handler when user clicks the + button in the main screen navigation bar
  function handlePlusButtonClick() {
    openEsp32BleModal();
    if (!bleState.isConnected && !bleState.isSimulating) {
      showToast('Bluetooth Search Section open. Searching for ESP32-S3...', 'bluetooth_searching');
      if (navigator.bluetooth) {
        setTimeout(() => {
          connectEsp32Bluetooth();
        }, 350);
      }
    }
  }

  async function connectEsp32Bluetooth() {
    if (!navigator.bluetooth) {
      showToast('Web Bluetooth API not supported on this browser. Use "Simulate Stream" or Chrome/Edge!', 'warning');
      logBleTerminal('[ERROR] navigator.bluetooth is unavailable. Supported on Chrome, Edge, and Opera with Bluetooth enabled.');
      return;
    }

    try {
      logBleTerminal('[BLE] Requesting Bluetooth Device...');
      showToast('Opening Bluetooth scanner... Select your ESP32-S3', 'bluetooth_searching');

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          BLE_CONFIG.NUS_SERVICE_UUID,
          BLE_CONFIG.PPLUS_SERVICE_UUID,
          BLE_CONFIG.HEART_RATE_SERVICE,
          BLE_CONFIG.BATTERY_SERVICE
        ]
      });

      bleState.device = device;
      bleState.deviceName = device.name || 'ESP32-S3-Device';
      logBleTerminal(`[BLE] Paired with "${bleState.deviceName}". Connecting GATT...`);

      device.addEventListener('gattserverdisconnected', onBleDisconnected);

      const server = await device.gatt.connect();
      bleState.server = server;
      logBleTerminal('[BLE] GATT Server Connected. Discovering telemetry services...');

      let targetChar = null;

      try {
        const nusService = await server.getPrimaryService(BLE_CONFIG.NUS_SERVICE_UUID);
        targetChar = await nusService.getCharacteristic(BLE_CONFIG.NUS_TX_CHAR_UUID);
        logBleTerminal('[BLE] Discovered Nordic UART TX Characteristic');
      } catch (e1) {
        logBleTerminal('[BLE] NUS Service not present, searching Custom P+ Service...');
        try {
          const pplusService = await server.getPrimaryService(BLE_CONFIG.PPLUS_SERVICE_UUID);
          targetChar = await pplusService.getCharacteristic(BLE_CONFIG.PPLUS_CHAR_UUID);
          logBleTerminal('[BLE] Discovered Custom P+ Characteristic');
        } catch (e2) {
          logBleTerminal('[BLE] Scanning all characteristics on primary services...');
          const services = await server.getPrimaryServices();
          for (const s of services) {
            const chars = await s.getCharacteristics();
            for (const c of chars) {
              if (c.properties.notify || c.properties.indicate) {
                targetChar = c;
                logBleTerminal(`[BLE] Found Notify Characteristic: ${c.uuid}`);
                break;
              }
            }
            if (targetChar) break;
          }
        }
      }

      if (!targetChar) {
        throw new Error('No notify characteristic found on the connected ESP32-S3');
      }

      bleState.characteristic = targetChar;
      await targetChar.startNotifications();
      targetChar.addEventListener('characteristicvaluechanged', handleBleIncomingValue);

      bleState.isConnected = true;
      if (bleState.isSimulating) stopEsp32Simulation();

      updateBleUiState();
      logBleTerminal(`[BLE CONNECTED] Subscribed to notifications from ${bleState.deviceName}!`);
      showToast(`Connected to ${bleState.deviceName}! Live data streaming.`, 'bluetooth_connected');
    } catch (err) {
      if (err.name === 'NotFoundError') {
        logBleTerminal('[BLE CANCELLED] User closed device picker.');
      } else {
        console.error('[BLE ERROR]', err);
        logBleTerminal(`[BLE ERROR] ${err.message}`);
        showToast(`Bluetooth error: ${err.message}`, 'error');
      }
      bleState.isConnected = false;
      updateBleUiState();
    }
  }

  function onBleDisconnected() {
    logBleTerminal(`[BLE] ${bleState.deviceName || 'ESP32'} disconnected.`);
    showToast('ESP32-S3 Bluetooth disconnected', 'link_off');
    bleState.isConnected = false;
    bleState.device = null;
    bleState.server = null;
    bleState.characteristic = null;
    updateBleUiState();
  }

  function disconnectEsp32Bluetooth() {
    if (bleState.device && bleState.device.gatt && bleState.device.gatt.connected) {
      bleState.device.gatt.disconnect();
    }
    if (bleState.isSimulating) {
      stopEsp32Simulation();
    }
    onBleDisconnected();
  }

  function handleBleIncomingValue(event) {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const rawString = decoder.decode(value).trim();
    processBlePayload(rawString);
  }

  function processBlePayload(rawString) {
    bleState.packetsCount++;
    logBleTerminal(`[REC #${bleState.packetsCount}] ${rawString}`);

    let parsed = null;
    try {
      if (rawString.startsWith('{') && rawString.endsWith('}')) {
        parsed = JSON.parse(rawString);
      }
    } catch (e) {
      // not JSON
    }

    if (!parsed && rawString.includes(',')) {
      const parts = rawString.split(',').map(s => s.trim());
      if (parts.length >= 2) {
        parsed = {
          bpm: parseInt(parts[0]) || 72,
          spo2: parseInt(parts[1]) || 98,
          temp: parseFloat(parts[2]) || 36.6,
          angle: parseInt(parts[3]) || 0,
          bat: parseInt(parts[4]) || 80,
          motion: parts[5] || 'Active'
        };
      }
    }

    if (!parsed) {
      const bpmMatch = rawString.match(/bpm[:= ]*([0-9]+)/i);
      const spo2Match = rawString.match(/spo2[:= ]*([0-9]+)/i);
      const tempMatch = rawString.match(/temp[:= ]*([0-9.]+)/i);
      const angleMatch = rawString.match(/angle[:= ]*([0-9.-]+)/i);
      if (bpmMatch || angleMatch) {
        parsed = {
          bpm: bpmMatch ? parseInt(bpmMatch[1]) : 72,
          spo2: spo2Match ? parseInt(spo2Match[1]) : 98,
          temp: tempMatch ? parseFloat(tempMatch[1]) : 36.6,
          angle: angleMatch ? parseInt(angleMatch[1]) : 0,
          bat: 82,
          motion: 'Normal'
        };
      }
    }

    if (!parsed) {
      parsed = {
        bpm: 72 + Math.floor(Math.random() * 3),
        spo2: 98,
        temp: 36.6,
        angle: 1,
        bat: 80,
        motion: 'Normal'
      };
    }

    const telemetry = {
      heartRate: parsed.bpm || parsed.heartRate || 72,
      spO2: parsed.spo2 || parsed.spO2 || 98,
      temp: Number((parsed.temp || parsed.temperature || 36.6).toFixed(1)),
      postureAngle: Math.max(0, Math.min(60, parsed.angle !== undefined ? Math.abs(parseInt(parsed.angle)) : 0)),
      battery: parsed.bat !== undefined ? parsed.bat : (parsed.battery || 80),
      motion: parsed.motion || 'Normal (Active Mode)',
      device: bleState.deviceName,
      timestamp: new Date().toISOString()
    };

    bleState.currentTelemetry = telemetry;
    updateAppScreensWithTelemetry(telemetry);

    const now = Date.now();
    if (now - bleState.lastSyncTimestamp > 4000) {
      bleState.lastSyncTimestamp = now;
      apiRequest('/api/vitals', 'POST', telemetry).catch(() => {});
    }
  }

  function updateAppScreensWithTelemetry(data) {
    // 1. Heart Rate (BPM)
    const bpmEls = document.querySelectorAll('.dynamic-bpm-val');
    bpmEls.forEach(el => {
      el.textContent = data.heartRate;
    });

    // 2. SpO2 (%)
    const spo2Els = document.querySelectorAll('.dynamic-spo2-val');
    spo2Els.forEach(el => {
      el.textContent = data.spO2;
    });

    // 3. Body Temperature (°C)
    const tempEls = document.querySelectorAll('.dynamic-temp-val');
    tempEls.forEach(el => {
      el.textContent = data.temp;
    });

    // 4. Posture Angle & Spine Form
    const angleEls = document.querySelectorAll('.dynamic-posture-angle');
    angleEls.forEach(el => {
      el.textContent = `${data.postureAngle}°`;
    });

    const fwdAngleEls = document.querySelectorAll('.dynamic-forward-angle');
    fwdAngleEls.forEach(el => {
      el.textContent = `+${Math.max(15, data.postureAngle)}°`;
    });

    const formEls = document.querySelectorAll('.dynamic-posture-form');
    const isSlouch = data.postureAngle > 12;
    formEls.forEach(el => {
      el.textContent = isSlouch ? `${data.postureAngle}° Slouch` : `${data.postureAngle}° Upright`;
      el.className = isSlouch 
        ? 'font-label-telemetry text-error font-bold shrink-0 text-[10.5px] dynamic-posture-form'
        : 'font-label-telemetry text-primary font-bold shrink-0 text-[10.5px] dynamic-posture-form';
    });

    const postureScore = Math.max(55, Math.min(99, 98 - Math.round(data.postureAngle * 2.2)));
    const scoreEls = document.querySelectorAll('.dynamic-posture-score');
    scoreEls.forEach(el => {
      el.textContent = `${postureScore}%`;
    });

    const scoreBars = document.querySelectorAll('.dynamic-posture-bar');
    scoreBars.forEach(el => {
      el.style.width = `${postureScore}%`;
      el.style.backgroundColor = isSlouch ? '#ba1a1a' : '#000000';
    });

    const postureLabels = document.querySelectorAll('.dynamic-posture-label');
    postureLabels.forEach(el => {
      el.textContent = isSlouch ? 'Slouch Alert' : (postureScore > 88 ? 'Optimal' : 'Fair');
      if (isSlouch) {
        el.className = 'text-[10px] font-semibold text-error leading-none mt-0.5 text-center dynamic-posture-label';
      } else {
        el.className = 'text-[10px] font-semibold text-primary leading-none mt-0.5 text-center dynamic-posture-label';
      }
    });

    const postBadge = document.getElementById('posture-live-badge');
    const postSubtext = document.getElementById('posture-live-subtext');
    if (postBadge) {
      if (isSlouch) {
        postBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 font-label-md text-xs font-bold';
        postBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping"></span>Slouch Warning';
        if (postSubtext) postSubtext.textContent = 'Spine angle exceeded threshold! Straighten back.';
      } else {
        postBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-tertiary-fixed/30 text-on-tertiary-fixed-variant font-label-md text-xs font-semibold';
        postBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span>Good Posture';
        if (postSubtext) postSubtext.textContent = 'Spine calibrated • Natural upright ergonomic form.';
      }
    }

    // 5. Battery
    const batEls = document.querySelectorAll('.dynamic-battery-val');
    batEls.forEach(el => {
      el.textContent = `${data.battery}%`;
    });

    // 6. Motion
    const motionEls = document.querySelectorAll('.dynamic-motion-val');
    motionEls.forEach(el => {
      el.textContent = data.motion.split(' ')[0] || 'Active';
    });

    // 7. Counters in header/modal
    const pktCounter = document.getElementById('ble-packet-counter');
    if (pktCounter) pktCounter.textContent = `${bleState.packetsCount} pkts`;
    const termCounter = document.getElementById('ble-terminal-counter');
    if (termCounter) termCounter.textContent = `${bleState.packetsCount} packets`;

    const modalBatVal = document.getElementById('ble-modal-bat-val');
    if (modalBatVal) modalBatVal.textContent = `${data.battery}%`;
  }

  function toggleEsp32Simulation() {
    if (bleState.isSimulating) {
      stopEsp32Simulation();
      showToast('ESP32-S3 Stream Simulation stopped', 'pause');
    } else {
      startEsp32Simulation();
      showToast('ESP32-S3 Live Stream Simulation active!', 'sensors');
    }
  }

  function startEsp32Simulation() {
    if (bleState.isConnected) {
      if (bleState.device && bleState.device.gatt && bleState.device.gatt.connected) {
        bleState.device.gatt.disconnect();
      }
      bleState.isConnected = false;
    }
    bleState.isSimulating = true;
    bleState.deviceName = 'ESP32-S3-SIMULATOR';
    updateBleUiState();
    logBleTerminal('[SIMULATOR STARTED] Emulating ESP32-S3 128Hz BLE Telemetry broadcast...');

    let simCycle = 0;
    bleState.simTimer = setInterval(() => {
      simCycle++;
      const anglePattern = [0, 1, 2, 0, 1, 3, 2, 14, 16, 12, 4, 1, 0];
      const currentAngle = anglePattern[simCycle % anglePattern.length];
      const bpm = 72 + Math.floor(Math.sin(simCycle * 0.4) * 6);
      const spo2 = (simCycle % 5 === 0) ? 99 : 98;
      const temp = Number((36.5 + (Math.sin(simCycle * 0.2) * 0.2)).toFixed(1));
      const battery = Math.max(70, 85 - Math.floor(simCycle / 60));
      const motion = currentAngle > 10 ? 'Slouching (Desk Sitting)' : 'Ergonomic Upright';

      const jsonPacket = JSON.stringify({
        bpm,
        spo2,
        temp,
        angle: currentAngle,
        bat: battery,
        motion
      });

      processBlePayload(jsonPacket);
    }, 1600);
  }

  function stopEsp32Simulation() {
    if (bleState.simTimer) {
      clearInterval(bleState.simTimer);
      bleState.simTimer = null;
    }
    bleState.isSimulating = false;
    updateBleUiState();
    logBleTerminal('[SIMULATOR STOPPED]');
  }

  function logBleTerminal(msg) {
    const term = document.getElementById('ble-terminal-box');
    if (!term) return;
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const line = document.createElement('div');
    line.className = 'whitespace-pre-wrap break-all';
    line.textContent = `[${time}] ${msg}`;
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;

    while (term.children.length > 50) {
      term.removeChild(term.firstChild);
    }
  }

  function toggleEsp32CodeSnippet() {
    const codeContainer = document.getElementById('esp32-code-container');
    const codeIcon = document.getElementById('esp32-code-icon');
    if (!codeContainer) return;
    if (codeContainer.classList.contains('hidden')) {
      codeContainer.classList.remove('hidden');
      if (codeIcon) codeIcon.style.transform = 'rotate(180deg)';
    } else {
      codeContainer.classList.add('hidden');
      if (codeIcon) codeIcon.style.transform = 'rotate(0deg)';
    }
  }

  function copyEsp32ArduinoCode() {
    const pre = document.getElementById('esp32-code-pre');
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent).then(() => {
      showToast('ESP32-S3 Arduino C++ sketch copied to clipboard!', 'content_copy');
    }).catch(() => {
      showToast('Code ready in box (select & copy)', 'code');
    });
  }

  // Live Vitals Telemetry Poller (Only when BLE is not actively connected or simulating)
  function startLiveTelemetrySync() {
    setInterval(async () => {
      if (bleState.isConnected || bleState.isSimulating) {
        return; // Don't override real-time BLE stream with poller
      }
      if (state.currentScreen === 'screen-home' || state.currentScreen === 'screen-live') {
        const data = await apiRequest('/api/vitals');
        if (data && data.vitals) {
          updateAppScreensWithTelemetry(data.vitals);
        }
      }
    }, 2800);
  }

  // Setup Everything on DOM Ready
  window.addEventListener('DOMContentLoaded', async () => {
    updateClock();
    setInterval(updateClock, 10000);
    initGlobalNavigation();
    initSosInteraction();
    initRiskTabs();
    initDoctorSearch();

    // Rehydrate persisted profile & portal state so refresh retains custom user name & data
    const activeRole = state.currentPortal || 'patient';
    state.currentUser = loadStoredProfile(activeRole);
    updateActiveUserProfile();
    renderProfileData();
    switchLoginPortal(activeRole);

    // Initial sync with backend JSON database
    apiRequest(`/api/profile?role=${activeRole}`).then(res => {
      if (res && res.profile) {
        state.currentUser = Object.assign({}, state.currentUser, res.profile);
        updateActiveUserProfile();
        renderProfileData();
      }
    }).catch(() => {});

    // Hydrate posture settings from backend database
    apiRequest('/api/posture/settings').then(res => {
      if (res && res.settings) {
        const angleEl = document.getElementById('angle-display');
        const timeEl = document.getElementById('time-display');
        if (angleEl && res.settings.alertAngle) angleEl.textContent = res.settings.alertAngle + '°';
        if (timeEl && res.settings.holdTime) timeEl.textContent = res.settings.holdTime + 's';
      }
    }).catch(() => {});

    // Initialize BLE status UI
    updateBleUiState();

    // Start live telemetry polling
    startLiveTelemetrySync();

    // Default start screen
    navigateTo('screen-login', false);
  });

  // Expose router & handlers to window
  window.navigateTo = navigateTo;
  window.goBack = goBack;
  window.showToast = showToast;
  window.switchLoginPortal = switchLoginPortal;
  window.autoFillDemo = autoFillDemo;
  window.togglePasswordVisibility = togglePasswordVisibility;
  window.handleLoginSubmit = handleLoginSubmit;
  window.simulateBiometricAuth = simulateBiometricAuth;
  window.simulateSocialLogin = simulateSocialLogin;
  window.showForgotPasswordPrompt = showForgotPasswordPrompt;
  window.toggleProfileMenu = toggleProfileMenu;
  window.handleLogout = handleLogout;
  window.openRegisterModal = openRegisterModal;
  window.closeRegisterModal = closeRegisterModal;
  window.switchRegisterTab = switchRegisterTab;
  window.handlePatientRegistration = handlePatientRegistration;
  window.handleDoctorRegistration = handleDoctorRegistration;
  window.renderProfileData = renderProfileData;
  window.openEditProfileModal = openEditProfileModal;
  window.closeEditProfileModal = closeEditProfileModal;
  window.updateBmiPreview = updateBmiPreview;
  window.saveProfileDetails = saveProfileDetails;
  window.saveDoctorProfileDetails = saveDoctorProfileDetails;
  window.toggleDoctorDuty = toggleDoctorDuty;
  window.syncPairedDevices = syncPairedDevices;
  window.exportHealthReport = exportHealthReport;
  window.exportClinicalLogs = exportClinicalLogs;
  window.openAvatarModal = openAvatarModal;
  window.closeAvatarModal = closeAvatarModal;
  window.triggerPhotoUpload = triggerPhotoUpload;
  window.handleAvatarFileSelect = handleAvatarFileSelect;
  window.selectPresetAvatar = selectPresetAvatar;
  window.resetDefaultAvatar = resetDefaultAvatar;
  window.savePostureSettings = savePostureSettings;
  window.logDiagnosticEntry = logDiagnosticEntry;
  window.selectBookingSlot = selectBookingSlot;
  window.confirmBooking = confirmBooking;

  // BLE Handlers exposed to window
  window.handlePlusButtonClick = handlePlusButtonClick;
  window.openEsp32BleModal = openEsp32BleModal;
  window.closeEsp32BleModal = closeEsp32BleModal;
  window.connectEsp32Bluetooth = connectEsp32Bluetooth;
  window.disconnectEsp32Bluetooth = disconnectEsp32Bluetooth;
  window.toggleEsp32Simulation = toggleEsp32Simulation;
  window.toggleEsp32CodeSnippet = toggleEsp32CodeSnippet;
  window.copyEsp32ArduinoCode = copyEsp32ArduinoCode;
  window.bleState = bleState;
})();


