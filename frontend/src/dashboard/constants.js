export const LLM_CONFIG = {
    mode: "local",
    local_url: "/v1/chat/completions",
    local_model: "phi-3.5-mini-instruct",
};

export const POSTIT_CHAR_LIMIT = 120;
export const TASK_CHAR_LIMIT = 80;

export const TCD_SEMESTERS = {
    michaelmas: "Michaelmas",
    hilary: "Hilary",
    trinity: "Trinity Term",
    yearlong: "Year-Long",
};

export const TCD_SEMESTER_COLORS = {
    michaelmas: "#e17055",
    hilary: "#00cec9",
    trinity: "#00b894",
    yearlong: "#6c5ce7",
};

export const MODULE_COLORS = ["#6c5ce7", "#00cec9", "#e17055", "#00b894", "#fdcb6e", "#e84393", "#a29bfe", "#74b9ff", "#55efc4", "#ff7675"];
export const TIMETABLE_HOURS = Array.from({ length: 13 }, (_, i) => `${(i + 8).toString().padStart(2, "0")}:00`);
export const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
export const WEEK_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export const DEFAULT_AMBIENT = {
    glowColor: "transparent",
    glowIntensity: 0,
    grainOpacity: 0.03,
    panelBlur: 20,
    panelOpacity: 0.03,
    borderWarmth: 0,
    mood: "neutral",
    particles: "none",
};
