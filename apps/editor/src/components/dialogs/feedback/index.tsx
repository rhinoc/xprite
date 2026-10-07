import { useEffect, useRef } from "react";

import { EditorDialog, useEditorDialogInitialFocus } from "$/components/dialogs/overlay";
import { tUi, useUiLanguage } from "$/i18n";
import { FeedbackCategory, type FeedbackController } from "$/managers/feedback/use-feedback";
import {
  Button,
  Combobox,
  ControlFlow,
  Field,
  Input,
  OverlayContentLayout,
  Text,
  TextArea,
  TextVariant,
} from "@xprite/ui";

import styles from "$/components/dialogs/feedback/feedback.module.css";

const DIALOG_BOUNDS = { x: 0, y: 0, width: 560, height: 420 };
const CONTENT_ROWS = 6;
const TYPE_PIXEL_WIDTH = 128;

export function FeedbackDialog({ manager }: { manager: FeedbackController }) {
  useUiLanguage();
  const form = useRef<HTMLFormElement>(null);
  const focusInitialInput = useEditorDialogInitialFocus();
  useEffect(() => {
    focusInitialInput(form.current, { selector: "textarea", typing: true });
  }, [focusInitialInput]);
  return (
    <EditorDialog
      open={manager.open}
      modal
      centerOnOpen
      constrainToViewport
      resizable={false}
      autoFocus={false}
      title={tUi("feedback.title")}
      defaultBounds={DIALOG_BOUNDS}
      contentLayout={OverlayContentLayout.Flow}
      onOpenChange={(open) => {
        if (!open) manager.close();
      }}
    >
      <form
        ref={form}
        className={styles.body}
        aria-busy={manager.busy}
        onSubmit={(event) => {
          event.preventDefault();
          void manager.submit();
        }}
      >
        <Field label={<Text variant={TextVariant.Control} text={tUi("feedback.type")} />}>
          <Combobox
            pixelWidth={TYPE_PIXEL_WIDTH}
            aria-label={tUi("feedback.type")}
            value={manager.category}
            disabled={manager.busy}
            onValueChange={(value) => manager.setCategory(value as FeedbackCategory)}
            options={[
              { value: FeedbackCategory.FeatureRequest, label: tUi("feedback.feature") },
              { value: FeedbackCategory.Bug, label: tUi("feedback.bug") },
              { value: FeedbackCategory.Other, label: tUi("feedback.other") },
            ]}
          />
        </Field>
        <Field label={<Text variant={TextVariant.Control} text={tUi("feedback.content")} />}>
          <TextArea
            name="message"
            rows={CONTENT_ROWS}
            required
            value={manager.message}
            disabled={manager.busy}
            placeholder={tUi("feedback.placeholder")}
            onChange={(event) => manager.setMessage(event.currentTarget.value)}
          />
        </Field>
        <Field label={<Text variant={TextVariant.Control} text={tUi("feedback.email")} />}>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            style={{ width: "100%" }}
            value={manager.email}
            disabled={manager.busy}
            onValueChange={manager.setEmail}
          />
        </Field>
        {manager.failed && (
          <div role="alert">
            <Text variant={TextVariant.Inline} wrap ink="var(--ui-overlay-text)">
              {tUi("feedback.failed")}
            </Text>
          </div>
        )}
        <ControlFlow className={styles.actions}>
          <Button
            type="button"
            text={tUi("ui.cancel")}
            disabled={manager.busy}
            onClick={manager.close}
          />
          <Button
            type="submit"
            text={tUi(manager.busy ? "feedback.submitting" : "feedback.submit")}
            disabled={manager.busy || !manager.message.trim()}
          />
        </ControlFlow>
      </form>
    </EditorDialog>
  );
}
