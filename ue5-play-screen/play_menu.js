/* VaCuus JS runs in the RmlUi document view; every emitted payload is flat. */
(function () {
	"use strict";

	function send(name, payload) {
		if (typeof vacuus !== "undefined" && typeof vacuus.emit === "function") {
			vacuus.emit(name, payload || {});
		}
	}

	function navigate(screen) {
		var navPositions = {
			play: { left: 0, width: 57 },
			inventory: { left: 83, width: 126 },
			clan: { left: 237, width: 61 },
			store: { left: 324, width: 72 },
			profile: { left: 422, width: 92 },
			settings: { left: 541, width: 108 }
		};
		var active = navPositions[screen];
		var navItems = ["play", "inventory", "clan", "store", "profile", "settings"];
		for (var i = 0; i < navItems.length; i += 1) {
			var item = document.getElementById("nav-" + navItems[i]);
			if (item) {
				if (navItems[i] === screen) item.classList.add("active");
				else item.classList.remove("active");
			}
		}
		if (active) {
			var line = document.getElementById("nav-active-line");
			if (line) {
				line.style.left = (active.left + 2) + "dp";
				line.style.width = (active.width - 4) + "dp";
			}
		}
		send("ui:navigate", {
			screen: screen,
			documentPath: screen === "play" ? "Play/play_menu.rml" : ""
		});
	}

	var selectedMode = "team_deathmatch";
	var selectedMap = "D17";
	var selectedCategory = "pvp";
	var selectedMatchTab = "quick_game";
	var selectedFilter = "all";
	var mapCards = [
		{ id: "map-trailer-park", map: "TRAILER PARK", mode: "plant_the_bomb" },
		{ id: "map-residential", map: "RESIDENTIAL", mode: "free_for_all" },
		{ id: "map-oil-base", map: "OIL BASE", mode: "team_deathmatch" },
		{ id: "map-d17", map: "D17", mode: "plant_the_bomb" },
		{ id: "map-angar", map: "ANGAR", mode: "team_deathmatch" },
		{ id: "map-arctic", map: "ARCTIC", mode: "free_for_all" },
		{ id: "map-villa", map: "VILLA", mode: "blitz" }
	];
	var mapScrollRange = 0;
	var mapScrollDragging = false;
	var mapDragStartY = 0;
	var mapDragStartOffset = 0;
	var mapThumbHeight = 265;

	function eventMouseY(event) {
		if (typeof event.mouseY === "number") return event.mouseY;
		var value = event.params && event.params.mouse_y;
		return typeof value === "number" ? value : 0;
	}

	function setMapScrollOffset(offset) {
		var grid = document.getElementById("map-selection-grid");
		var thumb = document.getElementById("map-scroll-thumb");
		if (!grid || !thumb) return;
		var clampedOffset = Math.max(0, Math.min(mapScrollRange, offset));
		grid.scrollTop = clampedOffset;
		var trackTravel = Math.max(0, 610 - mapThumbHeight);
		var actualOffset = Number(grid.scrollTop) || clampedOffset;
		var thumbTop = mapScrollRange > 0 ? trackTravel * actualOffset / mapScrollRange : 0;
		thumb.style.top = thumbTop + "dp";
	}

	function updateMapScrollbar(visibleCount) {
		var grid = document.getElementById("map-selection-grid");
		var content = document.getElementById("map-list-content");
		var track = document.getElementById("map-scroll-track");
		var thumb = document.getElementById("map-scroll-thumb");
		if (!grid || !content || !track || !thumb) return;

		var rowCount = Math.ceil(visibleCount / 3);
		var contentHeight = rowCount > 0 ? ((rowCount - 1) * 214) + 183 : 0;
		content.style.height = Math.max(610, contentHeight) + "dp";
		mapScrollRange = Math.max(0, contentHeight - 610);
		mapThumbHeight = mapScrollRange > 0
			? Math.max(68, Math.min(610, Math.round(610 * 610 / contentHeight)))
			: 265;
		track.style.display = mapScrollRange > 0 ? "block" : "none";
		thumb.style.height = mapThumbHeight + "dp";
		grid.scrollTop = 0;
		setMapScrollOffset(0);
	}

	function initializeMapScrollbar() {
		var grid = document.getElementById("map-selection-grid");
		var track = document.getElementById("map-scroll-track");
		if (!grid || !track) return;

		grid.addEventListener("mousescroll", function (event) {
			if (mapScrollRange <= 0) return;
			var delta = event.params && Number(event.params.wheel_delta_y);
			if (!Number.isFinite(delta) || delta === 0) return;
			event.preventDefault();
			setMapScrollOffset((Number(grid.scrollTop) || 0) + (delta * 48));
		});

		track.addEventListener("mousedown", function (event) {
			if (mapScrollRange <= 0) return;
			mapScrollDragging = true;
			var thumb = document.getElementById("map-scroll-thumb");
			if (thumb) thumb.classList.add("dragging");
			mapDragStartY = eventMouseY(event);
			mapDragStartOffset = Number(grid.scrollTop) || 0;
			event.preventDefault();
		});

		document.addEventListener("mousemove", function (event) {
			if (!mapScrollDragging || mapScrollRange <= 0) return;
			var trackTravel = Math.max(1, 610 - mapThumbHeight);
			var movement = eventMouseY(event) - mapDragStartY;
			setMapScrollOffset(mapDragStartOffset + (movement * mapScrollRange / trackTravel));
		});

		document.addEventListener("mouseup", function () {
			mapScrollDragging = false;
			var thumb = document.getElementById("map-scroll-thumb");
			if (thumb) thumb.classList.remove("dragging");
		});

		updateMapScrollbar(mapCards.length);
	}

	function setActive(ids, activeId) {
		for (var i = 0; i < ids.length; i += 1) {
			var element = document.getElementById(ids[i]);
			if (!element) continue;
			if (ids[i] === activeId) element.classList.add("active");
			else element.classList.remove("active");
		}
	}

	function openModeSelection() {
		var backdrop = document.getElementById("selection-backdrop");
		var screen = document.getElementById("game-mode-selection");
		if (backdrop) backdrop.style.display = "block";
		if (screen) screen.style.display = "block";
		setPlayActionsVisible(false);
	}

	function closeModeSelection() {
		var backdrop = document.getElementById("selection-backdrop");
		var screen = document.getElementById("game-mode-selection");
		if (backdrop) backdrop.style.display = "none";
		if (screen) screen.style.display = "none";
		setPlayActionsVisible(true);
	}

	function setPlayActionsVisible(visible) {
		var display = visible ? "block" : "none";
		var actionIds = ["mode-card", "mode-play-button", "quit-action", "bottom-actions"];
		for (var i = 0; i < actionIds.length; i += 1) {
			var action = document.getElementById(actionIds[i]);
			if (action) action.style.display = display;
		}
	}

	globalThis.PlayMenu = {
		navigate: navigate,
		openModeSelection: openModeSelection,
		closeModeSelection: closeModeSelection,
		setCategory: function (category) {
			selectedCategory = category;
			setActive(["category-pve", "category-ranked", "category-pvp"], "category-" + category);
			send("game:mode_category", { category: category });
		},
		setMatchTab: function (tab) {
			selectedMatchTab = tab;
			setActive(["quick-game-tab", "servers-tab"], tab === "quick_game" ? "quick-game-tab" : "servers-tab");
			send("game:matchmaking_tab", { tab: tab });
		},
		setModeFilter: function (mode) {
			selectedFilter = mode;
			var filterIds = ["filter-all", "filter-free-for-all", "filter-team-deathmatch", "filter-plant-the-bomb", "filter-blitz"];
			var selectedFilterId = mode === "all" ? "filter-all" : "filter-" + mode.replace(/_/g, "-");
			setActive(filterIds, selectedFilterId);
			if (mode !== "all") selectedMode = mode;
			var visibleIndex = 0;
			for (var i = 0; i < mapCards.length; i += 1) {
				var card = document.getElementById(mapCards[i].id);
				if (!card) continue;
				var visible = mode === "all" || mapCards[i].mode === mode;
				card.style.display = visible ? "block" : "none";
				if (visible) {
					card.style.left = ((visibleIndex % 3) * 393) + "dp";
					card.style.top = (Math.floor(visibleIndex / 3) * 214) + "dp";
					visibleIndex += 1;
				}
			}
			updateMapScrollbar(visibleIndex);
		},
		startModeFilter: function (mode) {
			selectedFilter = mode;
			if (mode !== "all") selectedMode = mode;
			globalThis.PlayMenu.startSelectedMatch();
		},
		selectMap: function (map, mode) {
			selectedMap = map;
			selectedMode = mode;
			for (var i = 0; i < mapCards.length; i += 1) {
				var card = document.getElementById(mapCards[i].id);
				if (!card) continue;
				if (mapCards[i].map === map) card.classList.add("selected");
				else card.classList.remove("selected");
			}
			send("game:select_mode", { mode: selectedMode, map: selectedMap });
		},
		startSelectedMatch: function () {
			send("game:play", {
				mode: selectedMode,
				map: selectedMap,
				category: selectedCategory,
				matchmaking: selectedMatchTab,
				filter: selectedFilter
			});
			closeModeSelection();
		},
		createPrivateRoom: function () {
			send("game:private_room", { mode: selectedMode, map: selectedMap, category: selectedCategory });
		},
		setPlayerHeader: function (clanName, playerName, rankImage) {
			var clan = document.getElementById("player-clan");
			var nickname = document.getElementById("player-nickname");
			var rank = document.getElementById("player-rang");
			if (clan && typeof clanName === "string") clan.textContent = clanName;
			if (nickname && typeof playerName === "string") nickname.textContent = playerName;
			if (rank && typeof rankImage === "string" && rankImage.length > 0) rank.setAttribute("src", rankImage);
		},
		setModeBackground: function (imagePath) {
			var image = document.getElementById("mode-art");
			if (image && typeof imagePath === "string" && imagePath.length > 0) {
				image.setAttribute("src", imagePath);
			}
		},
		selectMode: openModeSelection,
		startMatch: function () {
			send("game:play", { mode: "team_deathmatch", map: "D17" });
		},
		quit: function () {
			send("game:quit", {});
		},
		openUtility: function (utility) {
			send("ui:open_" + utility, {});
		}
	};

	initializeMapScrollbar();
})();
