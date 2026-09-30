(function(root,factory){const rules=factory();if(typeof module==='object'&&module.exports)module.exports=rules;else root.BusinessRules=rules;})(typeof window==='undefined'?globalThis:window,function(){
  const text=value=>String(value||'').trim().toLowerCase();
  function kind(category,mode='') {
    const value=text(category)||text(mode);
    if(/chicken|meat|meet|mutton|fish|seafood/.test(value))return 'chicken';
    if(/restaurant|restaurent|canteen/.test(value))return 'canteen';
    if(/cool|drink|juice/.test(value))return 'drinks';
    if(/retail|super|grocery/.test(value))return 'retail';
    return 'other';
  }
  function dineIn(category,mode=''){return kind(category,mode)==='canteen';}
  function weight(item,category,mode='') {
    const unit=text(item?.unit||item?.saleUnit||item?.weightUnit);
    if(['kg','kgs','kilogram','kilograms','g','gram','grams'].includes(unit))return true;
    if(kind(category,mode)!=='chicken')return false;
    const name=text(item?.name),group=text(item?.category);
    if(/\beggs?\b/.test(name))return false;
    if(['piece','pieces','pcs','pc','item','items','nos','no','dozen','packet','packets','box','boxes'].includes(unit))return false;
    // Older imports defaulted raw meat to Plate/quantity. Cooked dishes remain pieces/plates.
    const cooked=/biryani|fried rice|curry(?!\s*cut)|tikka|kebab|noodles|sandwich|burger|chicken\s*65/.test(name);
    if(cooked&&['plate','plates',''].includes(unit))return false;
    return item?.billingType==='weight'||/chicken|meat|meet|mutton|fish|seafood|keema|liver|wings/.test(name+' '+group);
  }
  return {kind,dineIn,weight};
});
