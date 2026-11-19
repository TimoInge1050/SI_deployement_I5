function decodeRegister(rawValue, dataType) {
  if (!Number.isInteger(rawValue) || rawValue < 0 || rawValue > 65535) {
    throw new Error("Le registre Modbus retourné est invalide");
  }
  if (dataType === "UINT16") {
    return rawValue;
  }
  if (dataType === "INT16") {
    return rawValue > 32767 ? rawValue - 65536 : rawValue;
  }
  throw new Error(`Type de donnée Modbus non pris en charge : ${dataType}`);
}

module.exports = decodeRegister;
