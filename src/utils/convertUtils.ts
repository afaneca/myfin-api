const ConvertUtils = {
  convertFloatToBigInteger: (floatVal: any) : number => Number(parseInt((floatVal * 100).toFixed(2), 10)),
  convertBigIntegerToFloat: (intVal: bigint): number => +(parseFloat(String(intVal)) / 100).toFixed(2),
};

export default ConvertUtils;
