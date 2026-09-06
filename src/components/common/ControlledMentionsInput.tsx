import React, { forwardRef, useEffect } from "react";
import {
  TextInput,
  Text,
  StyleSheet,
  StyleProp,
} from "react-native";
import { useMentions } from "react-native-controlled-mentions";
import { MentionInputProps } from "react-native-controlled-mentions/dist/components/mention-input/props";

export type ControlledMentionsInputProps<TriggerName extends string = string> =
  MentionInputProps<TriggerName> & {
    containerStyle?: StyleProp<any>;
    suggestionPosition?: "top" | "bottom";
  };

const ControlledMentionsInputComponent = <TriggerName extends string = string>(
  props: ControlledMentionsInputProps<TriggerName>,
  ref: React.ForwardedRef<TextInput>,
) => {
  const { onTriggersChange, containerStyle, suggestionPosition, ...mentionsProps } = props;
  const { triggers, textInputProps } = useMentions(mentionsProps as any);

  useEffect(() => {
    if (onTriggersChange) {
      onTriggersChange(triggers);
    }
  }, [triggers, onTriggersChange]);

  // Safely extract text color from style array or style object via StyleSheet.flatten
  const flattenedStyle = StyleSheet.flatten(props.style);
  const textColor = flattenedStyle?.color;

  // On Android, TextInput children (nested Text nodes for mentions) do NOT inherit the
  // TextInput's `color` style. If a base `color` exists on the input style, explicitly set it
  // on the top wrapper Text so plain text inherits it while mention tokens keep their textStyle.
  const children = textInputProps.children ? (
    textColor ? (
      <Text style={{ color: textColor }}>{textInputProps.children}</Text>
    ) : (
      textInputProps.children
    )
  ) : null;

  return (
    <TextInput
      ref={ref}
      {...textInputProps}
    >
      {children}
    </TextInput>
  );
};

export const ControlledMentionsInput = forwardRef(
  ControlledMentionsInputComponent,
) as <TriggerName extends string = string>(
  props: ControlledMentionsInputProps<TriggerName> & {
    ref?: React.ForwardedRef<TextInput>;
  },
) => React.ReactElement;

export default ControlledMentionsInput;
