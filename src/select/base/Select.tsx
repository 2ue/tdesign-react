import React, {
  useEffect,
  useMemo,
  KeyboardEvent,
  WheelEvent,
  useRef,
  useCallback,
  Children,
  cloneElement,
  isValidElement,
  useState,
} from 'react';
import classNames from 'classnames';
import isFunction from 'lodash/isFunction';
import get from 'lodash/get';
import debounce from 'lodash/debounce';
import { getOffsetTopToContainer } from '../../_util/helper';
import useControlled from '../../hooks/useControlled';
import { useLocaleReceiver } from '../../locale/LocalReceiver';
import useConfig from '../../hooks/useConfig';
import forwardRefWithStatics from '../../_util/forwardRefWithStatics';
import { getSelectValueArr, getSelectedOptions } from '../util/helper';
import noop from '../../_util/noop';
import FakeArrow from '../../common/FakeArrow';
import Loading from '../../loading';
import SelectInput, { SelectInputValue, SelectInputValueChangeContext } from '../../select-input';
import Option from './Option';
import OptionGroup from './OptionGroup';
import PopupContent from './PopupContent';
import Tag from '../../tag';
import { TdSelectProps, TdOptionProps, SelectOption, SelectValueChangeTrigger } from '../type';
import { StyledProps } from '../../common';
import { selectDefaultProps } from '../defaultProps';
import { PopupVisibleChangeContext } from '../../popup';
import useOptions from '../hooks/useOptions';
import composeRefs from '../../_util/composeRefs';
import { parseContentTNode } from '../../_util/parseTNode';
import useDefaultProps from '../../hooks/useDefaultProps';

export interface SelectProps<T = SelectOption> extends TdSelectProps<T>, StyledProps {
  // 子节点
  children?: React.ReactNode;
  onMouseEnter?: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  onMouseLeave?: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
}

type OptionsType = TdOptionProps[];

const Select = forwardRefWithStatics(
  (originalProps: SelectProps, ref: React.Ref<HTMLDivElement>) => {
    const props = useDefaultProps<SelectProps>(originalProps, selectDefaultProps);
    // 国际化文本初始化
    const [local, t] = useLocaleReceiver('select');
    const emptyText = t(local.loadingText);

    const {
      readonly,
      borderless,
      autoWidth,
      creatable,
      loadingText = emptyText,
      max,
      popupProps,
      reserveKeyword,
      className,
      style,
      disabled,
      size,
      multiple,
      placeholder,
      clearable,
      prefixIcon,
      options,
      filterable,
      loading,
      empty,
      valueType,
      keys,
      children,
      collapsedItems,
      minCollapsedNum,
      valueDisplay,
      showArrow,
      inputProps,
      panelBottomContent,
      panelTopContent,
      selectInputProps,
      tagInputProps,
      tagProps,
      scroll,
      suffixIcon,
      label,
      filter,
      onFocus,
      onBlur,
      onClear = noop,
      onCreate,
      onRemove,
      onSearch,
      onEnter,
      onPopupVisibleChange,
    } = props;

    const [value, onChange] = useControlled(props, 'value', props.onChange);
    const selectInputRef = useRef(null);
    const { classPrefix } = useConfig();
    const { overlayClassName, onScroll, onScrollToBottom, ...restPopupProps } = popupProps || {};
    const [isScrolling, toggleIsScrolling] = useState(false);

    const name = `${classPrefix}-select`; // t-select

    const [showPopup, setShowPopup] = useControlled(props, 'popupVisible', onPopupVisibleChange);
    const [inputValue, onInputChange] = useControlled(props, 'inputValue', props.onInputChange);

    const { currentOptions, setCurrentOptions, tmpPropOptions, valueToOption, selectedOptions } = useOptions(
      keys,
      options,
      children,
      valueType,
      value,
      reserveKeyword,
    );

    const selectedLabel = useMemo(() => {
      if (multiple) {
        return selectedOptions.map((selectedOption) => get(selectedOption || {}, keys?.label || 'label') || '');
      }
      return get(selectedOptions[0] || {}, keys?.label || 'label') || undefined;
    }, [selectedOptions, keys, multiple]);

    const handleShowPopup = (visible: boolean, ctx: PopupVisibleChangeContext) => {
      if (disabled) return;
      visible && toggleIsScrolling(false);
      !visible && onInputChange('', { trigger: 'blur' });
      setShowPopup(visible, ctx);
    };

    // 可以根据触发来源，自由定制标签变化时的筛选器行为
    const onTagChange = (_currentTags: SelectInputValue, context) => {
      const { trigger, index, item, e } = context;
      // backspace
      if (trigger === 'backspace') {
        e.stopPropagation();

        let closest = -1;
        let len = index;
        while (len >= 0) {
          if (!selectedOptions[len]?.disabled) {
            closest = len;
            break;
          }
          len -= 1;
        }
        if (closest < 0) {
          return;
        }
        const values = getSelectValueArr(value, value[closest], true, valueType, keys);

        // 处理onChange回调中的selectedOptions参数
        const currentSelectedOptions = getSelectedOptions(values, multiple, valueType, keys, tmpPropOptions);
        onChange(values, { e, trigger, selectedOptions: currentSelectedOptions });
        return;
      }

      if (trigger === 'clear') {
        e.stopPropagation();
        onChange([], { e, trigger, selectedOptions: [] });
        return;
      }

      if (trigger === 'tag-remove') {
        e?.stopPropagation?.();
        const values = getSelectValueArr(value, value[index], true, valueType, keys);
        // 处理onChange回调中的selectedOptions参数
        const currentSelectedOptions = getSelectedOptions(values, multiple, valueType, keys, tmpPropOptions);

        onChange(values, { e, trigger, selectedOptions: currentSelectedOptions });
        if (isFunction(onRemove)) {
          onRemove({
            value: value[index],
            data: {
              label: item,
              value: value[index],
            },
            e,
          });
        }
      }
    };
    const onCheckAllChange = (checkAll: boolean, e: React.MouseEvent<HTMLLIElement>) => {
      if (!multiple) {
        return;
      }

      const values = currentOptions
        .filter((option) => !option.checkAll && !option.disabled)
        .map((option) => option[keys?.value || 'value']);
      const selectableOptions = getSelectedOptions(values, multiple, valueType, keys, tmpPropOptions);

      const checkAllValue =
        !checkAll && selectableOptions.length !== (props.value as Array<SelectOption>)?.length ? selectableOptions : [];
      onChange?.(checkAllValue, { e, trigger: checkAll ? 'check' : 'uncheck', selectedOptions: checkAllValue });
    };

    // 选中 Popup 某项
    const handleChange = (
      value: string | number | Array<string | number | Record<string, string | number>>,
      context: { e: React.MouseEvent<HTMLLIElement>; trigger: SelectValueChangeTrigger },
    ) => {
      if (multiple) {
        !reserveKeyword && inputValue && onInputChange('', { e: context.e, trigger: 'change' });
      }
      if (creatable && isFunction(onCreate)) {
        if ((options as OptionsType).filter((option) => option.value === value).length === 0) {
          onCreate(value as string); // 手动输入 此时为string
        }
      }
      // 处理onChange回调中的selectedOptions参数
      const currentSelectedOptions = getSelectedOptions(value, multiple, valueType, keys, tmpPropOptions);

      onChange?.(value, { ...context, selectedOptions: currentSelectedOptions });
    };

    // 处理filter逻辑
    const handleFilter = (value: string) => {
      let filteredOptions: OptionsType = [];
      if (filterable && isFunction(onSearch)) {
        return;
      }
      if (!value) {
        setCurrentOptions(tmpPropOptions);
        return;
      }

      if (filter && isFunction(filter)) {
        // 如果有自定义的filter方法 使用自定义的filter方法
        if (Array.isArray(tmpPropOptions)) {
          filteredOptions = tmpPropOptions.filter((option) => filter(value, option));
        } else if (Array.isArray(Object.values(valueToOption))) {
          filteredOptions = Object.values(valueToOption).filter((option) => filter(value, option));
        }
      } else if (Array.isArray(tmpPropOptions)) {
        const upperValue = value.toUpperCase();
        filteredOptions = tmpPropOptions.filter((option) => (option?.label || '').toUpperCase().includes(upperValue)); // 不区分大小写
      }
      const isSameLabelOptionExist = filteredOptions.find((option) => option.label === value);
      if (creatable && !isSameLabelOptionExist) {
        filteredOptions = filteredOptions.concat([{ label: value, value }]);
      }
      setCurrentOptions(filteredOptions);
    };

    // 处理输入框逻辑
    const handleInputChange = (value: string, context: SelectInputValueChangeContext) => {
      if (context.trigger !== 'clear') {
        onInputChange(value, { e: context.e, trigger: 'input' });
      }
      if (value === undefined) {
        return;
      }
      if (isFunction(onSearch)) {
        onSearch(value, { e: context.e as KeyboardEvent<HTMLDivElement> });
        return;
      }
    };

    const onClearValue = (context) => {
      context.e.stopPropagation();
      if (Array.isArray(value)) {
        onChange([], { ...context, selectedOptions: [] });
      } else {
        onChange(null, { ...context, selectedOptions: [] });
      }
      onClear(context);
    };

    useEffect(() => {
      if (typeof inputValue !== 'undefined') {
        handleFilter(String(inputValue));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inputValue, tmpPropOptions]);

    // 渲染后置图标
    const renderSuffixIcon = () => {
      if (suffixIcon) {
        return suffixIcon;
      }
      if (loading) {
        return (
          <Loading className={classNames(`${name}__right-icon`, `${name}__active-icon`)} loading={true} size="small" />
        );
      }

      return showArrow && <FakeArrow className={`${name}__right-icon`} isActive={showPopup} disabled={disabled} />;
    };
    const getPopupInstance = useCallback(() => (selectInputRef as any).current?.getPopupContentElement(), []);

    const childrenWithProps = Children.map(children, (child) => {
      if (isValidElement(child)) {
        const addedProps = { multiple };
        return cloneElement(child, { ...addedProps });
      }
      return child;
    });
    // 渲染主体内容
    const renderContent = () => {
      const popupContentProps = {
        onChange: handleChange,
        value,
        className,
        size,
        multiple,
        showPopup,
        // popup弹出层内容只会在点击事件之后触发 并且无任何透传参数
        setShowPopup: (show: boolean) => handleShowPopup(show, {}),
        options: currentOptions,
        empty,
        max,
        loadingText,
        loading,
        valueType,
        keys,
        panelBottomContent,
        panelTopContent,
        onCheckAllChange,
        getPopupInstance,
        scroll,
      };
      return <PopupContent {...popupContentProps}>{childrenWithProps}</PopupContent>;
    };

    const renderValueDisplay = () => {
      if (!valueDisplay) {
        if (!multiple) {
          if (typeof selectedLabel !== 'string') {
            return selectedLabel;
          }
          return '';
        }
        return ({ value: val }) =>
          val.slice(0, minCollapsedNum ? minCollapsedNum : val.length).map((v: string, key: number) => {
            const filterOption: SelectOption & { disabled?: boolean } = options?.find((option) => option.label === v);
            return (
              <Tag
                key={key}
                closable={!filterOption?.disabled && !disabled && !readonly}
                size={size}
                {...tagProps}
                onClose={({ e }) => {
                  e.stopPropagation();
                  const values = getSelectValueArr(value, value[key], true, valueType, keys);

                  const selectedOptions = getSelectedOptions(values, multiple, valueType, keys, tmpPropOptions);
                  onChange(values, { e, selectedOptions, trigger: 'uncheck' });
                  tagProps?.onClose?.({ e });

                  onRemove?.({
                    value: value[key],
                    data: { label: v, value: value[key] },
                    e: e as unknown as React.MouseEvent<HTMLDivElement, MouseEvent>,
                  });
                }}
              >
                {v}
              </Tag>
            );
          });
      }
      if (typeof valueDisplay === 'string') {
        return valueDisplay;
      }
      if (multiple) {
        return ({ onClose }) => parseContentTNode(valueDisplay, { value: selectedOptions, onClose });
      }
      return parseContentTNode(valueDisplay, { value: selectedLabel, onClose: noop });
    };

    // 将第一个选中的 option 置于列表可见范围的最后一位
    const updateScrollTop = (content: HTMLDivElement) => {
      if (!content || isScrolling) {
        return;
      }
      const firstSelectedNode: HTMLDivElement = content.querySelector(`.${classPrefix}-is-selected`);
      if (!multiple && firstSelectedNode) {
        const { paddingBottom } = getComputedStyle(firstSelectedNode);
        const { marginBottom } = getComputedStyle(content);
        const elementBottomHeight = parseInt(paddingBottom, 10) + parseInt(marginBottom, 10);
        // 小于0时不需要特殊处理，会被设为0
        const updateValue =
          getOffsetTopToContainer(firstSelectedNode, content) -
          content.offsetTop -
          (content.clientHeight - firstSelectedNode.clientHeight) +
          elementBottomHeight;

        // 通过 setTimeout 确保组件渲染完成后再设置 scrollTop
        setTimeout(() => {
          // eslint-disable-next-line no-param-reassign
          content.scrollTop = updateValue;
        });
      }
    };

    const { onMouseEnter, onMouseLeave } = props;

    const handleEnter = (_, context: { inputValue: string; e: KeyboardEvent<HTMLDivElement> }) => {
      onEnter?.({ ...context, value });
    };

    const handleScroll = ({ e }: { e: WheelEvent<HTMLDivElement> }) => {
      toggleIsScrolling(true);

      onScroll?.({ e });
      if (onScrollToBottom) {
        const debounceOnScrollBottom = debounce((e) => onScrollToBottom({ e }), 100);

        const { scrollTop, clientHeight, scrollHeight } = e.target as HTMLDivElement;
        if (clientHeight + Math.floor(scrollTop) === scrollHeight) {
          debounceOnScrollBottom(e);
        }
      }
    };
    return (
      <div
        className={classNames(`${name}__wrap`, className)}
        style={style}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <SelectInput
          autoWidth={!style?.width && autoWidth}
          ref={composeRefs(ref, selectInputRef)}
          className={name}
          readonly={readonly}
          autofocus={props.autofocus}
          allowInput={(filterable ?? local.filterable) || isFunction(filter)}
          multiple={multiple}
          value={selectedLabel}
          options={props.options}
          valueDisplay={renderValueDisplay()}
          clearable={clearable}
          disabled={disabled}
          status={props.status}
          tips={props.tips}
          borderless={borderless}
          label={label}
          suffix={props.suffix}
          prefixIcon={prefixIcon}
          suffixIcon={renderSuffixIcon()}
          panel={renderContent()}
          placeholder={!multiple && showPopup && selectedLabel ? selectedLabel : placeholder || t(local.placeholder)}
          inputValue={inputValue}
          tagInputProps={{
            size,
            ...tagInputProps,
          }}
          tagProps={{ size, ...tagProps }}
          inputProps={{
            size,
            ...inputProps,
          }}
          minCollapsedNum={minCollapsedNum}
          collapsedItems={collapsedItems}
          updateScrollTop={updateScrollTop}
          popupProps={{
            overlayClassName: [`${name}__dropdown`, overlayClassName],
            onScroll: handleScroll,
            ...restPopupProps,
          }}
          popupVisible={showPopup}
          onPopupVisibleChange={handleShowPopup}
          onTagChange={onTagChange}
          onInputChange={handleInputChange}
          onFocus={onFocus}
          onEnter={handleEnter}
          onBlur={(_, context) => {
            onBlur?.({ value, e: context.e as React.FocusEvent<HTMLDivElement> });
          }}
          onClear={onClearValue}
          {...selectInputProps}
        />
      </div>
    );
  },
  { Option, OptionGroup },
);

Select.displayName = 'Select';

export default Select;
