const PROTOCOL_SMALL_PACKET_SIZE = 64;
const PROTOCOL_LARGE_PACKET_SIZE = 1024;

const PROTOCOL_COMMANDS = {
	SET_FAN_COLORS_A: 0x85,
	SET_FAN_COLORS_B: 0x83,
	SET_PER_LED: 0x14,
};
const PROTOCOL_COMPAT_COLOR_COMMANDS = [PROTOCOL_COMMANDS.SET_FAN_COLORS_A, PROTOCOL_COMMANDS.SET_FAN_COLORS_B];
const PROTOCOL_COMPAT_PER_LED_SELECTORS = [0x01];
const CANVAS_LAYOUT_WIDTH = 36;
const CANVAS_LAYOUT_HEIGHT = 12;
const CANVAS_FAN_LED_COUNT = 8;

class HydroShiftLedProtocol {
	constructor(config) {
		const cfg = config || {};
		this.debug = cfg.debug === true;
	}

	logDebug(message) {
		if (!this.debug) {
			return;
		}
		device.log("[HydroShiftLCDRGB][Protocol] " + message);
	}

	writePacket(packet, size, tag) {
		try {
			device.write(packet, size);
			return true;
		} catch (error) {
			this.logDebug(tag + " failed: " + toErrorMessage(error));
			return false;
		}
	}

	sendSmallPacket(command, data) {
		const finalPacket = [
			0x01,
			command & 0xFF,
			0x00,
			0x00,
			0x00,
			data.length & 0xFF,
		].concat(data);

		return this.writePacket(finalPacket, PROTOCOL_SMALL_PACKET_SIZE, "sendSmallPacket");
	}

	sendLargePacket(command, packetData, totalLength) {
		const finalPacket = [
			0x02,
			command & 0xFF,
			(totalLength >> 24) & 0xFF,
			(totalLength >> 16) & 0xFF,
			(totalLength >> 8) & 0xFF,
			totalLength & 0xFF,
			0x00,
			0x00,
			0x00,
			(packetData.length >> 8) & 0xFF,
			packetData.length & 0xFF,
		].concat(packetData);

		return this.writePacket(finalPacket, PROTOCOL_LARGE_PACKET_SIZE, "sendLargePacket");
	}

	buildInitPayloadVariantA() {
		return [
			0x03, 0x04, 0x00, 0x00,
			0x00, 0x00, 0x00, 0x00,
			0x00, 0x00, 0x00, 0x00,
			0x00, 0x00, 0x00, 0x00,
			0x00, 0x00, 0x00, 0x32,
		];
	}

	buildInitPayloadVariantB() {
		return [
			0x00, 0x03, 0x04, 0x00,
			0x00, 0x00, 0x00,
			0x00, 0x00, 0x00, 0x00,
			0x00, 0x00, 0x00, 0x00,
			0x00, 0x00, 0x00, 0x00,
		];
	}

	sendSmallCompat(payloadA, payloadB, tag) {
		let anySuccess = false;

		for (let i = 0; i < PROTOCOL_COMPAT_COLOR_COMMANDS.length; i++) {
			const command = PROTOCOL_COMPAT_COLOR_COMMANDS[i];
			const okA = this.sendSmallPacket(command, payloadA);
			const okB = this.sendSmallPacket(command, payloadB);
			anySuccess = anySuccess || okA || okB;
		}

		if (!anySuccess) {
			this.logDebug(tag + " failed on all small command variants");
		}

		return anySuccess;
	}

	initializeLedOnly() {
		const initOk = this.sendSmallCompat(
			this.buildInitPayloadVariantA(),
			this.buildInitPayloadVariantB(),
			"initialize-prime"
		);

		return initOk;
	}

	toRgbByteArray(colors) {
		if (!Array.isArray(colors)) {
			return [];
		}
		const rgbBytes = [];
		for (let i = 0; i < colors.length; i++) {
			rgbBytes.push(clampByte(colors[i]));
		}
		return rgbBytes;
	}

	sendFanPerLedCompat(mainChannelRgb) {
		const rgbData = this.toRgbByteArray(mainChannelRgb);
		if (rgbData.length === 0) {
			return true;
		}

		let anySuccess = false;
		for (let i = 0; i < PROTOCOL_COMPAT_PER_LED_SELECTORS.length; i++) {
			const selector = PROTOCOL_COMPAT_PER_LED_SELECTORS[i];
			const packetData = [selector].concat(rgbData);
			const ok = this.sendLargePacket(
				PROTOCOL_COMMANDS.SET_PER_LED,
				packetData,
				packetData.length
			);
			anySuccess = anySuccess || ok;
		}

		if (!anySuccess) {
			this.logDebug("per-led compat failed for all selectors");
		}

		return anySuccess;
	}
}

export function Name() {
	return "Lian Li Hydroshift LCD AIO (LED Only)";
}

export function VendorId() {
	return 0x0416;
}

export function ProductId() {
	return 0x7399;
}

export function Publisher() {
	return "WhirlwindFx";
}

export function Documentation() {
	return "troubleshooting/lian-li";
}

export function Size() {
	return [CANVAS_LAYOUT_WIDTH, CANVAS_LAYOUT_HEIGHT];
}

export function DefaultComponentBrand() {
	return "LianLi";
}

export function DeviceType() {
	return "lightingcontroller";
}

export function ImageUrl() {
	return "https://lian-li.com/wp-content/uploads/2024/06/shift_002.webp";
}

export function Validate(endpoint) {
	return endpoint.interface === 1;
}

export function ConflictingProcesses() {
	return [];
}

/* global
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
*/

export function ControllableParameters() {
	return [
		{
			property: "shutdownColor",
			group: "lighting",
			label: "Shutdown Color",
			min: "0",
			max: "360",
			type: "color",
			default: "#000000",
		},
		{
			property: "LightingMode",
			group: "lighting",
			label: "Lighting Mode",
			type: "combobox",
			values: ["Forced", "Canvas"],
			default: "Forced",
		},
		{
			property: "forcedColor",
			group: "lighting",
			label: "Forced Color",
			min: "0",
			max: "360",
			type: "color",
			default: "#00ff00",
		},
	];
}

const DEBUG = false;
const RETRY_INTERVAL_MS = 2000;
const PERIODIC_INIT_MS = 86400000;
const KEEPALIVE_INTERVAL_MS = 2500;
const IMMEDIATE_RETRY_PAUSE_MS = 6;
const CANVAS_SPIKE_PREV_MAX_THRESHOLD = 4;
const CANVAS_SPIKE_CURRENT_MAX_THRESHOLD = 220;
const CANVAS_SPIKE_WINDOW_MS = 400;
const MAX_MAIN_LED_COUNT = CANVAS_FAN_LED_COUNT * 3;
const FALLBACK_MAIN_LED_COUNT = CANVAS_FAN_LED_COUNT * 3;

let protocol = null;
let isInitialized = false;
let nextRetryAt = 0;
let lastInitAt = 0;
let lastFrameSignature = "";
let forceRefresh = true;
let lastWriteAt = 0;
let lastWriteErrorAt = 0;
let lastForcedRgb = [0, 0, 0];
let observedMainLedCount = 0;
let lastCanvasPerLedData = [];
let pendingForcedApply = false;
let pendingForcedColorValue = null;
let controllableLedPositions = [];
let lastControllableAlpha01 = [];
let lastAcceptedCanvasFrameMax = 0;
let lastAcceptedCanvasFrameAt = 0;

function logDebug(message) {
	if (!DEBUG) {
		return;
	}

	device.log("[HydroShiftLCDRGB] " + message);
}

function toErrorMessage(error) {
	if (!error) {
		return "unknown error";
	}

	if (typeof error === "string") {
		return error;
	}

	if (error.message) {
		return error.message;
	}

	return String(error);
}

function logWriteFailure(message) {
	if (!DEBUG) {
		return;
	}

	const now = Date.now();
	if (now - lastWriteErrorAt < 2000) {
		return;
	}

	lastWriteErrorAt = now;
	logDebug(message);
}

function clampByte(value) {
	if (typeof value !== "number" || Number.isNaN(value)) {
		return 0;
	}

	if (value < 0) {
		return 0;
	}

	if (value > 255) {
		return 255;
	}

	return value & 0xFF;
}

function toRgbByte(value) {
	return clampByte(Math.round(value));
}

function normalizeRgbTripletFromInput(r, g, b) {
	const values = [r, g, b];
	for (let i = 0; i < values.length; i++) {
		if (typeof values[i] !== "number" || !Number.isFinite(values[i])) {
			return null;
		}
	}

	const looksUnitRange =
		values[0] >= 0 && values[0] <= 1 &&
		values[1] >= 0 && values[1] <= 1 &&
		values[2] >= 0 && values[2] <= 1;

	if (looksUnitRange) {
		return [
			toRgbByte(values[0] * 255),
			toRgbByte(values[1] * 255),
			toRgbByte(values[2] * 255),
		];
	}

	return [
		toRgbByte(values[0]),
		toRgbByte(values[1]),
		toRgbByte(values[2]),
	];
}

function normalizeRgbTuple(rgb, fallbackRgb) {
	const fallback = Array.isArray(fallbackRgb) ? fallbackRgb : [0, 0, 0];
	const source = Array.isArray(rgb) ? rgb : fallback;
	return [
		clampByte(source[0]),
		clampByte(source[1]),
		clampByte(source[2]),
	];
}

function tryResolveRgbFromObject(value) {
	if (!value || typeof value !== "object") {
		return null;
	}

	// Handle array-like color objects that are not true Arrays.
	if (
		typeof value.length === "number" &&
		value.length >= 3 &&
		typeof value[0] === "number" &&
		typeof value[1] === "number" &&
		typeof value[2] === "number"
	) {
		const normalizedLikeArray = normalizeRgbTripletFromInput(value[0], value[1], value[2]);
		if (Array.isArray(normalizedLikeArray)) {
			return normalizedLikeArray;
		}
	}

	const channelTripletCandidates = [
		["r", "g", "b"],
		["red", "green", "blue"],
		["R", "G", "B"],
	];

	for (let i = 0; i < channelTripletCandidates.length; i++) {
		const keys = channelTripletCandidates[i];
		if (
			typeof value[keys[0]] === "number" &&
			typeof value[keys[1]] === "number" &&
			typeof value[keys[2]] === "number"
		) {
			const normalized = normalizeRgbTripletFromInput(
				value[keys[0]],
				value[keys[1]],
				value[keys[2]]
			);
			if (Array.isArray(normalized)) {
				return normalized;
			}
		}
	}

	if (
		typeof value.red === "function" &&
		typeof value.green === "function" &&
		typeof value.blue === "function"
	) {
		try {
			const normalizedMethodRgb = normalizeRgbTripletFromInput(
				value.red(),
				value.green(),
				value.blue()
			);
			if (Array.isArray(normalizedMethodRgb)) {
				return normalizedMethodRgb;
			}
		} catch (error) {
			// Ignore and continue with other conversion paths.
		}
	}

	return null;
}

function isBlackRgb(rgb) {
	if (!Array.isArray(rgb) || rgb.length < 3) {
		return true;
	}

	return clampByte(rgb[0]) === 0 && clampByte(rgb[1]) === 0 && clampByte(rgb[2]) === 0;
}

function normalizePositiveLedCount(value) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return 0;
	}

	const rounded = Math.floor(value);
	if (rounded <= 0) {
		return 0;
	}

	if (rounded > MAX_MAIN_LED_COUNT) {
		return MAX_MAIN_LED_COUNT;
	}

	return rounded;
}

function resolveMainLedCount() {
	const layoutLedCount = normalizePositiveLedCount(controllableLedPositions.length);
	if (layoutLedCount > 0) {
		observedMainLedCount = layoutLedCount;
		return layoutLedCount;
	}

	try {
		if (typeof device.getLedCount === "function") {
			const runtimeLedCount = normalizePositiveLedCount(device.getLedCount());
			if (runtimeLedCount > 0) {
				observedMainLedCount = runtimeLedCount;
				return runtimeLedCount;
			}
		}
	} catch (error) {
		// Ignore and continue with observed/fallback values.
	}

	if (observedMainLedCount > 0) {
		return observedMainLedCount;
	}

	const fallbackLedCount = normalizePositiveLedCount(FALLBACK_MAIN_LED_COUNT);
	return fallbackLedCount > 0 ? fallbackLedCount : MAX_MAIN_LED_COUNT;
}

function buildControllableFanLayout(ledsPerFan) {
	const names = [];
	const positions = [];
	const perFanCount = normalizePositiveLedCount(ledsPerFan);
	const effectivePerFanCount = perFanCount > 0 ? perFanCount : CANVAS_FAN_LED_COUNT;
	const fanCenters = [
		[6, 6],
		[18, 6],
		[30, 6],
	];
	const radius = 4;

	for (let fanIndex = 0; fanIndex < fanCenters.length; fanIndex++) {
		const centerX = fanCenters[fanIndex][0];
		const centerY = fanCenters[fanIndex][1];
		for (let ledIndex = 0; ledIndex < effectivePerFanCount; ledIndex++) {
			const angle = (Math.PI * 2 * ledIndex) / effectivePerFanCount - (Math.PI / 2);
			const x = Math.round(centerX + radius * Math.cos(angle));
			const y = Math.round(centerY + radius * Math.sin(angle));
			names.push("Fan " + (fanIndex + 1) + " LED " + (ledIndex + 1));
			positions.push([x, y]);
		}
	}

	return {
		names: names,
		positions: positions,
	};
}

function setupControllableFanLeds() {
	if (typeof device.setControllableLeds !== "function") {
		return;
	}

	const layout = buildControllableFanLayout(CANVAS_FAN_LED_COUNT);
	const controllableLedNames = layout.names;
	controllableLedPositions = layout.positions;
	device.setControllableLeds(controllableLedNames, controllableLedPositions);
}

function normalizeColorHexInput(value) {
	if (typeof value === "string") {
		const trimmed = value.trim();
		const longMatch = /^#?([a-f\d]{6})$/i.exec(trimmed);
		if (longMatch) {
			return "#" + longMatch[1].toLowerCase();
		}

		// Accept #RRGGBBAA and ignore alpha.
		const match8 = /^#?([a-f\d]{8})$/i.exec(trimmed);
		if (match8) {
			return "#" + match8[1].substring(0, 6).toLowerCase();
		}

		const shortMatch = /^#?([a-f\d]{3})$/i.exec(trimmed);
		if (shortMatch) {
			return "#" + shortMatch[1].toLowerCase();
		}

		return "";
	}

	if (value && typeof value === "object") {
		if (typeof value.hex === "string") {
			return normalizeColorHexInput(value.hex);
		}
		if (typeof value.value === "string") {
			return normalizeColorHexInput(value.value);
		}
	}

	return "";
}

function isExplicitBlackHex(hex) {
	return /^#?0{6}$/i.test(hex);
}

function createRgbFromHexString(hex, fallbackRgb) {
	const fallback = Array.isArray(fallbackRgb) ? fallbackRgb : [0, 0, 0];

	if (typeof hex !== "string") {
		return fallback;
	}

	const value = normalizeColorHexInput(hex);
	if (value.length === 0) {
		return fallback;
	}

	const longMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(value);
	if (longMatch) {
		return [
			parseInt(longMatch[1], 16),
			parseInt(longMatch[2], 16),
			parseInt(longMatch[3], 16),
		];
	}

	const shortMatch = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(value);
	if (shortMatch) {
		return [
			parseInt(shortMatch[1] + shortMatch[1], 16),
			parseInt(shortMatch[2] + shortMatch[2], 16),
			parseInt(shortMatch[3] + shortMatch[3], 16),
		];
	}

	logDebug("invalid color string: '" + value + "'");
	return fallback;
}

function tryColorValueToRgb(value) {
	const extractedHex = normalizeColorHexInput(value);

	if (Array.isArray(value) && value.length >= 3) {
		const normalizedArray = normalizeRgbTripletFromInput(value[0], value[1], value[2]);
		if (Array.isArray(normalizedArray)) {
			return normalizedArray;
		}
		return [clampByte(value[0]), clampByte(value[1]), clampByte(value[2])];
	}

	if (value && typeof value === "object") {
		const objectResolved = tryResolveRgbFromObject(value);
		if (Array.isArray(objectResolved) && objectResolved.length >= 3) {
			return objectResolved;
		}

		const hasRgb =
			typeof value.r === "number" &&
			typeof value.g === "number" &&
			typeof value.b === "number";
		if (hasRgb) {
			const normalizedObject = normalizeRgbTripletFromInput(value.r, value.g, value.b);
			if (Array.isArray(normalizedObject)) {
				return normalizedObject;
			}
			return [clampByte(value.r), clampByte(value.g), clampByte(value.b)];
		}
	}

	if (extractedHex.length > 0) {
		return createRgbFromHexString(extractedHex, [0, 0, 0]);
	}

	try {
		const converted = device.createColorArray(value, 1, "Inline", "RGB");
		if (Array.isArray(converted) && converted.length >= 3) {
			const convertedRgb = [
				clampByte(converted[0]),
				clampByte(converted[1]),
				clampByte(converted[2]),
			];
			if (!isBlackRgb(convertedRgb) || isExplicitBlackHex(extractedHex)) {
				return convertedRgb;
			}
		}
	} catch (error) {
		// Fall through to secondary conversions.
	}

	return null;
}

function readColorAlpha01(value) {
	if (Array.isArray(value) && value.length >= 4 && typeof value[3] === "number") {
		const alphaArray = value[3];
		if (!Number.isFinite(alphaArray)) {
			return null;
		}
		if (alphaArray <= 1) {
			return Math.max(0, Math.min(1, alphaArray));
		}
		return Math.max(0, Math.min(1, alphaArray / 255));
	}

	if (value && typeof value === "object") {
		const alphaKeys = ["a", "alpha", "opacity", "A"];
		for (let i = 0; i < alphaKeys.length; i++) {
			const key = alphaKeys[i];
			if (typeof value[key] === "number" && Number.isFinite(value[key])) {
				if (value[key] <= 1) {
					return Math.max(0, Math.min(1, value[key]));
				}
				return Math.max(0, Math.min(1, value[key] / 255));
			}
		}

		if (typeof value.alpha === "function") {
			try {
				const alphaMethod = value.alpha();
				if (typeof alphaMethod === "number" && Number.isFinite(alphaMethod)) {
					if (alphaMethod <= 1) {
						return Math.max(0, Math.min(1, alphaMethod));
					}
					return Math.max(0, Math.min(1, alphaMethod / 255));
				}
			} catch (error) {
				// Ignore and continue with other paths.
			}
		}

		const rawHex = typeof value.hex === "string"
			? value.hex.trim()
			: (typeof value.value === "string" ? value.value.trim() : "");
		const rgbaHex = /^#?([a-f\d]{8})$/i.exec(rawHex);
		if (rgbaHex) {
			const alphaByte = parseInt(rgbaHex[1].substring(6, 8), 16);
			return Math.max(0, Math.min(1, alphaByte / 255));
		}
	}

	if (typeof value === "string") {
		const rgbaHex = /^#?([a-f\d]{8})$/i.exec(value.trim());
		if (rgbaHex) {
			const alphaByte = parseInt(rgbaHex[1].substring(6, 8), 16);
			return Math.max(0, Math.min(1, alphaByte / 255));
		}
	}

	return null;
}

function applyAlphaToRgb(rgb, alpha01) {
	if (!Array.isArray(rgb) || rgb.length < 3) {
		return [0, 0, 0];
	}

	if (typeof alpha01 !== "number" || !Number.isFinite(alpha01)) {
		return [clampByte(rgb[0]), clampByte(rgb[1]), clampByte(rgb[2])];
	}

	const alpha = Math.max(0, Math.min(1, alpha01));
	return [
		toRgbByte(clampByte(rgb[0]) * alpha),
		toRgbByte(clampByte(rgb[1]) * alpha),
		toRgbByte(clampByte(rgb[2]) * alpha),
	];
}

function getForcedRgb(overrideColorValue) {
	const sourceValue = overrideColorValue !== undefined && overrideColorValue !== null
		? overrideColorValue
		: forcedColor;

	const sourceResolved = tryColorValueToRgb(sourceValue);
	if (Array.isArray(sourceResolved) && sourceResolved.length >= 3) {
		const normalizedSource = normalizeRgbTuple(sourceResolved, [0, 0, 0]);
		lastForcedRgb = normalizedSource;
		return normalizedSource;
	}

	const globalResolved = tryColorValueToRgb(forcedColor);
	if (Array.isArray(globalResolved) && globalResolved.length >= 3) {
		const normalizedGlobal = normalizeRgbTuple(globalResolved, [0, 0, 0]);
		lastForcedRgb = normalizedGlobal;
		return normalizedGlobal;
	}

	return normalizeRgbTuple(lastForcedRgb, [0, 0, 0]);
}

function colorValueKey(value) {
	if (Array.isArray(value)) {
		return value.map(clampByte).join(",");
	}
	if (value && typeof value === "object") {
		if (
			typeof value.r === "number" &&
			typeof value.g === "number" &&
			typeof value.b === "number"
		) {
			return [clampByte(value.r), clampByte(value.g), clampByte(value.b)].join(",");
		}
		const hex = normalizeColorHexInput(value);
		if (hex.length > 0) {
			return hex;
		}
	}
	if (typeof value === "string") {
		return normalizeColorHexInput(value);
	}
	return String(value);
}

function getCanvasRgb() {
	// Sample from a real mapped LED coordinate, never from a global (0,0) probe.
	if (!Array.isArray(controllableLedPositions) || controllableLedPositions.length === 0) {
		return [0, 0, 0];
	}
	const samplePos = controllableLedPositions[0];
	if (!Array.isArray(samplePos) || samplePos.length < 2) {
		return [0, 0, 0];
	}
	try {
		const canvasPixel = device.color(samplePos[0], samplePos[1]);
		const resolvedPixel = tryColorValueToRgb(canvasPixel);
		if (Array.isArray(resolvedPixel) && resolvedPixel.length >= 3) {
			const normalizedPixel = normalizeRgbTuple(resolvedPixel, [0, 0, 0]);
			const alpha01 = readColorAlpha01(canvasPixel);
			const outputPixel = alpha01 !== null
				? applyAlphaToRgb(normalizedPixel, alpha01)
				: normalizedPixel;
			return outputPixel;
		}
	} catch (error) {
		logDebug("device.color sample fallback failed: " + toErrorMessage(error));
	}
	return [0, 0, 0];
}

function getCanvasPerLedDataFromControllableLayout() {
	if (!Array.isArray(controllableLedPositions) || controllableLedPositions.length === 0) {
		return null;
	}

	const output = [];
	if (lastControllableAlpha01.length !== controllableLedPositions.length) {
		lastControllableAlpha01 = new Array(controllableLedPositions.length).fill(null);
	}
	for (let i = 0; i < controllableLedPositions.length; i++) {
		const position = controllableLedPositions[i];
		if (!Array.isArray(position) || position.length < 2) {
			output.push(0, 0, 0);
			continue;
		}

		try {
			const colorValue = device.color(position[0], position[1]);
			let alpha01 = readColorAlpha01(colorValue);
			if (alpha01 === null) {
				const cachedAlpha = lastControllableAlpha01[i];
				if (typeof cachedAlpha === "number" && Number.isFinite(cachedAlpha)) {
					alpha01 = cachedAlpha;
				}
			}
			if (alpha01 !== null) {
				lastControllableAlpha01[i] = alpha01;
			}
			if (alpha01 !== null && alpha01 <= 0.001) {
				output.push(0, 0, 0);
				continue;
			}

			const rgb = tryColorValueToRgb(colorValue);
			if (Array.isArray(rgb) && rgb.length >= 3) {
				const normalized = normalizeRgbTuple(rgb, [0, 0, 0]);
				const alphaAware = alpha01 !== null
					? applyAlphaToRgb(normalized, alpha01)
					: normalized;
				output.push(alphaAware[0], alphaAware[1], alphaAware[2]);
				continue;
			}
		} catch (error) {
			// Fallback handled below as strict black.
		}

		output.push(0, 0, 0);
	}

	if (output.length < 3) {
		return null;
	}
	return output;
}

function getCanvasPerLedData() {
	const controllableLayoutData = getCanvasPerLedDataFromControllableLayout();
	if (Array.isArray(controllableLayoutData) && controllableLayoutData.length >= 3) {
		lastCanvasPerLedData = controllableLayoutData.slice();
		observedMainLedCount = normalizePositiveLedCount(Math.floor(controllableLayoutData.length / 3));
		return controllableLayoutData;
	}

	if (Array.isArray(lastCanvasPerLedData) && lastCanvasPerLedData.length >= 3) {
		return lastCanvasPerLedData;
	}

	return null;
}

function getTargetRgb() {
	if (LightingMode === "Canvas") {
		return getCanvasRgb();
	}

	return getForcedRgb();
}

function buildFrameSignature(rgb) {
	return [
		LightingMode,
		colorValueKey(forcedColor),
		colorValueKey(shutdownColor),
		rgb[0],
		rgb[1],
		rgb[2],
	].join("|");
}

function buildPerLedFrameSignature(perLedData) {
	if (!Array.isArray(perLedData)) {
		return "CanvasPerLed|invalid";
	}

	return [
		"CanvasPerLed",
		perLedData.length,
		perLedData.join(","),
	].join("|");
}

function getPerLedFrameMaxChannel(perLedData) {
	if (!Array.isArray(perLedData) || perLedData.length === 0) {
		return 0;
	}

	let maxChannel = 0;
	for (let i = 0; i < perLedData.length; i++) {
		const value = clampByte(perLedData[i]);
		if (value > maxChannel) {
			maxChannel = value;
		}
	}
	return maxChannel;
}

function shouldDropCanvasSpikeFrame(perLedData, now) {
	if (!Array.isArray(perLedData) || perLedData.length < 3) {
		return false;
	}

	if (lastAcceptedCanvasFrameAt <= 0) {
		return false;
	}

	const currentMax = getPerLedFrameMaxChannel(perLedData);
	const deltaMs = now - lastAcceptedCanvasFrameAt;
	const isImpossibleJump =
		lastAcceptedCanvasFrameMax <= CANVAS_SPIKE_PREV_MAX_THRESHOLD &&
		currentMax >= CANVAS_SPIKE_CURRENT_MAX_THRESHOLD &&
		deltaMs >= 0 &&
		deltaMs <= CANVAS_SPIKE_WINDOW_MS;

	if (isImpossibleJump) {
		logDebug(
			"drop canvas spike frame prevMax=" + lastAcceptedCanvasFrameMax +
			" currentMax=" + currentMax +
			" dtMs=" + deltaMs
		);
		return true;
	}

	return false;
}

function markCanvasFrameAccepted(perLedData, now) {
	lastAcceptedCanvasFrameMax = getPerLedFrameMaxChannel(perLedData);
	lastAcceptedCanvasFrameAt = now;
}

function markDisconnected() {
	isInitialized = false;
	nextRetryAt = Date.now() + RETRY_INTERVAL_MS;
}

function ensureProtocol() {
	if (protocol !== null) {
		return;
	}

	protocol = new HydroShiftLedProtocol({ debug: DEBUG });
}

function initializeLedModeIfNeeded() {
	ensureProtocol();

	const now = Date.now();
	const staleInit = isInitialized && (now - lastInitAt >= PERIODIC_INIT_MS);
	if (isInitialized && !staleInit) {
		return true;
	}

	if (!isInitialized && now < nextRetryAt) {
		return false;
	}

	const ok = protocol.initializeLedOnly();
	if (!ok) {
		markDisconnected();
		return false;
	}

	isInitialized = true;
	lastInitAt = now;
	return true;
}

function setupChannels() {
	device.SetLedLimit(MAX_MAIN_LED_COUNT);
	setupControllableFanLeds();
}

function writePerLedFrame(rgb) {
	const ledCount = resolveMainLedCount();
	const r = clampByte(rgb[0]);
	const g = clampByte(rgb[1]);
	const b = clampByte(rgb[2]);
	const perLed = [];
	for (let i = 0; i < ledCount; i++) {
		perLed.push(r, g, b);
	}
	const ok = writePerLedDataFrame(perLed);
	if (!ok) {
		logWriteFailure("per-led write failed");
	}

	return ok;
}

function writePerLedDataFrame(perLedData) {
	const ok = protocol.sendFanPerLedCompat(perLedData);
	if (!ok) {
		logWriteFailure("per-led write failed");
	}

	return ok;
}

function writeForcedFrame(rgb) {
	// Stable baseline path: per-led only for forced mode.
	const ok = writePerLedFrame(rgb);

	if (!ok) {
		logWriteFailure("forced write failed");
	}

	return ok;
}

function writePerLedFrameWithRecovery(rgb, reasonTag) {
	if (writePerLedFrame(rgb)) {
		return true;
	}

	logDebug("retrying write after LED re-init (" + reasonTag + ")");
	const initOk = protocol.initializeLedOnly();
	if (!initOk) {
		logWriteFailure("re-init failed during " + reasonTag);
		return false;
	}

	isInitialized = true;
	lastInitAt = Date.now();
	device.pause(IMMEDIATE_RETRY_PAUSE_MS);
	return writePerLedFrame(rgb);
}

function writeForcedFrameWithRecovery(rgb, reasonTag) {
	if (writeForcedFrame(rgb)) {
		return true;
	}

	logDebug("retrying forced write after LED re-init (" + reasonTag + ")");
	const initOk = protocol.initializeLedOnly();
	if (!initOk) {
		logWriteFailure("re-init failed during forced " + reasonTag);
		return false;
	}

	isInitialized = true;
	lastInitAt = Date.now();
	device.pause(IMMEDIATE_RETRY_PAUSE_MS);
	return writeForcedFrame(rgb);
}

function applyForcedColorImmediately(reasonTag, overrideColorValue) {
	logDebug(
		"apply forced entry (" + reasonTag + ") mode=" + LightingMode + " init=" + (isInitialized ? "1" : "0")
	);
	if (LightingMode !== "Forced") {
		return;
	}

	ensureProtocol();
	forceRefresh = true;
	const rgb = getForcedRgb(overrideColorValue);

	if (!initializeLedModeIfNeeded()) {
		nextRetryAt = 0;
		if (!initializeLedModeIfNeeded()) {
			logWriteFailure("init failed during " + reasonTag);
			return;
		}
	}

	logDebug(
		"apply forced now (" + reasonTag + ") source=" +
		colorValueKey(overrideColorValue !== null && overrideColorValue !== undefined ? overrideColorValue : forcedColor) +
		" rgb=" + rgb[0] + "," + rgb[1] + "," + rgb[2]
	);
	if (!writeForcedFrameWithRecovery(rgb, reasonTag)) {
		// Keep handle alive and retry next frame instead of forcing disconnected state.
		forceRefresh = true;
		return;
	}

	// Double push to minimize "applies only on reload" behavior on strict firmware.
	device.pause(IMMEDIATE_RETRY_PAUSE_MS);
	writeForcedFrame(rgb);

	lastFrameSignature = buildFrameSignature(rgb);
	lastWriteAt = Date.now();
	forceRefresh = false;
}

export function Initialize() {
	setupChannels();
	ensureProtocol();
	forceRefresh = true;
	lastFrameSignature = "";
	lastWriteAt = 0;
	lastAcceptedCanvasFrameMax = 0;
	lastAcceptedCanvasFrameAt = 0;

	if (!initializeLedModeIfNeeded()) {
		logDebug("initial LED setup failed, retry scheduled");
	}
}

export function Render() {
	try {
		if (!initializeLedModeIfNeeded()) {
			return;
		}

		if (pendingForcedApply && LightingMode === "Forced") {
			const pendingValue = pendingForcedColorValue;
			pendingForcedApply = false;
			pendingForcedColorValue = null;
			applyForcedColorImmediately("render-pending-forced", pendingValue);
			return;
		}

		if (LightingMode === "Canvas") {
			const perLedCanvasData = getCanvasPerLedData();
			if (Array.isArray(perLedCanvasData) && perLedCanvasData.length >= 3) {
				const signature = buildPerLedFrameSignature(perLedCanvasData);
				const now = Date.now();
				const keepaliveDue = (now - lastWriteAt) >= KEEPALIVE_INTERVAL_MS;
				if (shouldDropCanvasSpikeFrame(perLedCanvasData, now)) {
					forceRefresh = true;
					return;
				}

				if (!forceRefresh && !keepaliveDue && signature === lastFrameSignature) {
					markCanvasFrameAccepted(perLedCanvasData, now);
					return;
				}

				const writeOk = writePerLedDataFrame(perLedCanvasData);
				if (!writeOk) {
					forceRefresh = true;
					return;
				}

				lastFrameSignature = signature;
				forceRefresh = false;
				lastWriteAt = now;
				markCanvasFrameAccepted(perLedCanvasData, now);
				return;
			}
		}

		const rgb = getTargetRgb();
		const signature = buildFrameSignature(rgb);
		const now = Date.now();
		const keepaliveDue = (now - lastWriteAt) >= KEEPALIVE_INTERVAL_MS;

		if (!forceRefresh && !keepaliveDue && signature === lastFrameSignature) {
			return;
		}

		const writeOk = LightingMode === "Forced"
			? writeForcedFrameWithRecovery(rgb, "render-forced")
			: writePerLedFrameWithRecovery(rgb, "render-canvas");
		if (!writeOk) {
			forceRefresh = true;
			return;
		}

		lastFrameSignature = signature;
		forceRefresh = false;
		lastWriteAt = now;
	} catch (error) {
		logDebug("render exception: " + toErrorMessage(error));
		markDisconnected();
	}
}

function resolveShutdownRgb() {
	const resolved = tryColorValueToRgb(shutdownColor);
	if (Array.isArray(resolved) && resolved.length >= 3) {
		return normalizeRgbTuple(resolved, [0, 0, 0]);
	}

	return createRgbFromHexString(shutdownColor, [0, 0, 0]);
}

export function Shutdown(SystemSuspending) {
	ensureProtocol();
	const shutdownRgb = resolveShutdownRgb();
	logDebug(
		"shutdown entry suspending=" + (SystemSuspending ? "1" : "0") +
		" rgb=" + shutdownRgb[0] + "," + shutdownRgb[1] + "," + shutdownRgb[2]
	);

	forceRefresh = true;
	lastFrameSignature = "";
	nextRetryAt = 0;

	if (!initializeLedModeIfNeeded()) {
		const initOk = protocol.initializeLedOnly();
		if (initOk) {
			isInitialized = true;
			lastInitAt = Date.now();
		} else {
			logWriteFailure("shutdown init failed");
		}
	}

	if (!writeForcedFrameWithRecovery(shutdownRgb, "shutdown-1")) {
		logWriteFailure("shutdown write failed (shutdown-1)");
	}
	device.pause(25);
	if (!writeForcedFrameWithRecovery(shutdownRgb, "shutdown-2")) {
		logWriteFailure("shutdown write failed (shutdown-2)");
	}
	device.pause(25);
	if (!writeForcedFrameWithRecovery(shutdownRgb, "shutdown-3")) {
		logWriteFailure("shutdown write failed (shutdown-3)");
	}

	isInitialized = false;
	nextRetryAt = Date.now() + RETRY_INTERVAL_MS;
	lastWriteAt = 0;
}

export function onLightingModeChanged() {
	forceRefresh = true;
	lastFrameSignature = "";
	lastAcceptedCanvasFrameMax = 0;
	lastAcceptedCanvasFrameAt = 0;
	if (LightingMode === "Forced") {
		pendingForcedApply = true;
		pendingForcedColorValue = forcedColor;
		applyForcedColorImmediately("LightingModeChanged", forcedColor);
	}
}

function resolveForcedChangeValue(newColor) {
	if (newColor === null || newColor === undefined) {
		return forcedColor;
	}

	if (typeof newColor === "string" && normalizeColorHexInput(newColor).length === 0) {
		return forcedColor;
	}

	return newColor;
}

export function onforcedColorChanged(newColor) {
	const callbackKey = colorValueKey(newColor);
	const globalKey = colorValueKey(forcedColor);
	const resolvedValue = resolveForcedChangeValue(newColor);
	const resolvedKey = colorValueKey(resolvedValue);
	forceRefresh = true;
	lastFrameSignature = "";
	pendingForcedApply = true;
	pendingForcedColorValue = resolvedValue;
	logDebug(
		"forcedColor changed callback=" + callbackKey +
		" global=" + globalKey +
		" resolved=" + resolvedKey
	);
}

export function onshutdownColorChanged() {
	forceRefresh = true;
}
