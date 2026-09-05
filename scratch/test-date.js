const parseDate = (dateStr) => {
    if (!dateStr) return null;
    
    // If it's already an ISO string with Z or offset, use it directly
    if (dateStr.endsWith("Z") || dateStr.match(/[+-]\d\d:\d\d$/)) {
      return new Date(dateStr);
    }
    
    // Replace space with T to make it a valid ISO string before offset
    const isoString = dateStr.trim().replace(" ", "T");
    
    // Append +06:00 to correctly parse it as Bangladesh local time
    return new Date(isoString + "+06:00");
};

console.log("No Z, no T:", parseDate("2026-09-06 10:26:00"));
console.log("With T, no Z:", parseDate("2026-09-06T10:26:00"));
console.log("With Z:", parseDate("2026-09-06 10:26:00Z"));
console.log("With T and Z:", parseDate("2026-09-06T10:26:00Z"));
