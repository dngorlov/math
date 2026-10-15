// Понятные названия типов задач для статистики преподавателя
export const KIND_NAMES = {
  'trig:sin': 'Значения синуса', 'trig:cos': 'Значения косинуса', 'trig:tg': 'Значения тангенса', 'trig:ctg': 'Значения котангенса',
  'deriv:table': 'Табличная производная', 'deriv:reverse': 'Производная наоборот (найти функцию)',
  'deriv:chain-pow': 'Производная степени', 'deriv:chain-exp': 'Производная e^(kx)', 'deriv:chain-sin': 'Производная sin(kx)',
  'deriv:chain-cos': 'Производная cos(kx)', 'deriv:chain-ln': 'Производная ln(kx) — ловушка',
  'ratlim:equal': 'Дробь на бесконечности: равные степени', 'ratlim:less': 'Дробь на бесконечности: знаменатель старше',
  'ratlim:more': 'Дробь на бесконечности: числитель старше',
  'basiclim:table': 'Табличные пределы', 'basiclim:q': 'Предел qⁿ', 'basiclim:root': 'Корень n-й степени из числа',
  'remark:sin': 'sin(ax)/(bx)', 'remark:tgsin': 'tg(ax)/sin(bx)', 'remark:ln': 'ln(1+ax)/(bx)', 'remark:exp': '(e^(ax)−1)/(bx)',
  'remark:cos': '(1−cos ax)/x²', 'remark:second': 'Второй замечательный: (1+a/n)^(bn)', 'remark:secondneg': 'Второй замечательный: (1−a/n)ⁿ',
  'growth:compare': 'Что растёт быстрее', 'growth:limit': 'Предел отношения по скорости роста',
  'w-derivpoint': 'Производная многочлена в точке', 'w-derivchain:powlin': 'Сложная функция: (ax+b)ⁿ',
  'w-derivchain:lnexp': 'Сумма ln и экспоненты', 'w-derivchain:sqrt': 'Производная корня', 'w-derivchain:prod': 'Производная произведения',
  'w-limfactor': 'Сокращение множителя', 'w-limequiv:single': 'Эквивалентности: одна замена', 'w-limequiv:product': 'Эквивалентности в произведении',
  'w-limsecond': 'Неопределённость 1^∞', 'w-limconj': 'Разность корней (сопряжённое)', 'w-limratinf': 'Старшие члены на бесконечности',
  'bank': 'Вопросы из банка',
};
export const kindName = (k) => KIND_NAMES[k] || k;
