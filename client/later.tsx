import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { laterCancelRpc, type LaterRow as LaterRowData } from "../shared/schedule";

function formatWhen(iso: string): string {
  const at = new Date(iso);
  const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  if (Number.isNaN(at.getTime())) return "an unknown time";
  return at.toDateString() === new Date().toDateString() ? time : `${at.toLocaleDateString()} ${time}`;
}

/** The scheduling row: what waits, when it goes, and a cancel action while it waits. */
export function LaterRow({ item, theme, layout }: PluginTimelineItemProps<LaterRowData>) {
  const cancel = useRpc(laterCancelRpc);
  const toast = useToast();
  const [cancelling, setCancelling] = useState(false);
  const data = item.data;
  const pending = data.state === "pending";
  const styles = useMemo(
    () => ({
      card: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        borderRadius: 10,
        padding: layout.compact ? 10 : 12,
        gap: 6,
      },
      header: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      title: { color: theme.colors.foreground, fontSize: 13, fontWeight: "600" as const, flexShrink: 1 },
      time: { color: theme.colors.foregroundMuted, fontSize: 12 },
      message: {
        color: data.state === "cancelled" ? theme.colors.foregroundMuted : theme.colors.foreground,
        fontSize: 13,
      },
      error: { color: theme.colors.statusDanger, fontSize: 12 },
      cancel: { color: theme.colors.accent, fontSize: 12 },
      pressed: { opacity: 0.6 },
    }),
    [theme, layout.compact, data.state],
  );

  const icon =
    data.state === "sent"
      ? { name: "Check", color: theme.colors.statusSuccess }
      : data.state === "failed"
        ? { name: "AlertTriangle", color: theme.colors.statusDanger }
        : data.state === "cancelled"
          ? { name: "X", color: theme.colors.foregroundMuted }
          : { name: "Clock", color: theme.colors.foregroundMuted };

  async function onCancel() {
    if (cancelling) return;
    setCancelling(true);
    try {
      await cancel({ id: data.id });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Icon name={icon.name} size={16} color={icon.color} />
        <Text style={styles.title}>
          {data.state === "sent"
            ? `Sent at ${formatWhen(data.dueAt)}`
            : data.state === "failed"
              ? "Not sent"
              : data.state === "cancelled"
                ? "Cancelled"
                : `Scheduled for ${formatWhen(data.dueAt)}`}
        </Text>
        {pending ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel this scheduled message"
            disabled={cancelling}
            onPress={() => void onCancel()}
            style={({ pressed }) => (pressed ? styles.pressed : undefined)}
          >
            <Text style={styles.cancel}>{cancelling ? "Cancelling…" : "Cancel"}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.message}>{data.message}</Text>
      {data.error ? <Text style={styles.error}>{data.error}</Text> : null}
    </View>
  );
}
