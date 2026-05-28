import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Appbar,
  Button,
  Checkbox,
  Dialog,
  Divider,
  Portal,
  SegmentedButtons,
  Surface,
  Switch,
  Text,
} from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import client from "../api/client";
import BottomNavBar from "../components/BottomNavBar";
import { useI18n } from "../i18n/useI18n";
import { useAuthStore } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";

const PLATFORM_RULES = [
  { key: "facebook", label: "Facebook", icon: "facebook", color: "#1877f2" },
  { key: "instagram", label: "Instagram", icon: "instagram", color: "#c13584" },
  { key: "telegram", label: "Telegram", icon: "send", color: "#229ed9" },
  { key: "widget", label: "Widget", icon: "web", color: "#0f766e" },
];

const normalizeRuleAssignees = (value) => {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.filter(Boolean).map((item) => String(item));
};

export default function AssignmentCenterScreen({ navigation }) {
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);
  const colors = useThemeStore((state) => state.colors);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [settings, setSettings] = useState(null);
  const [overview, setOverview] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ruleDialog, setRuleDialog] = useState(null);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [selectedLabelId, setSelectedLabelId] = useState(null);
  const [draftEmployeeIds, setDraftEmployeeIds] = useState([]);
  const [labelDraftEmployeeIds, setLabelDraftEmployeeIds] = useState([]);
  const [overviewExpanded, setOverviewExpanded] = useState(false);

  const isBusiness = user?.role === "business";
  const autoAssignEnabled = Boolean(settings?.auto_assign_enabled);
  const employeeOptions = useMemo(
    () =>
      assignees.filter(
        (assignee) => assignee.type === "employee" && assignee.id,
      ),
    [assignees],
  );
  const employeeNameById = useMemo(() => {
    const entries = employeeOptions.map((employee) => [
      String(employee.id),
      employee.name,
    ]);
    return Object.fromEntries(entries);
  }, [employeeOptions]);
  const selectedLabel = useMemo(
    () => labels.find((label) => String(label.id) === String(selectedLabelId)),
    [labels, selectedLabelId],
  );

  const fetchCenter = useCallback(
    async ({ refresh = false } = {}) => {
      if (!isBusiness) return;
      setError("");
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const [settingsRes, overviewRes, assigneesRes, labelsRes] =
          await Promise.all([
            client.get("/api/assignments/settings"),
            client.get("/api/assignments/overview"),
            client.get("/api/assignments/assignees"),
            client.get("/api/labels"),
          ]);
        setSettings(settingsRes.data);
        setOverview(overviewRes.data);
        setAssignees(assigneesRes.data);
        setLabels(labelsRes.data);
      } catch (err) {
        setError(err.response?.data?.detail || t("assignment.loadError"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isBusiness, t],
  );

  useEffect(() => {
    fetchCenter();
  }, [fetchCenter]);

  useEffect(() => {
    if (!selectedLabelId) return;
    const selectedLabelExists = labels.some(
      (label) => String(label.id) === String(selectedLabelId),
    );
    if (!selectedLabelExists) {
      setSelectedLabelId(null);
      setLabelDraftEmployeeIds([]);
    }
  }, [labels, selectedLabelId]);

  const patchSettings = async (patch) => {
    const previousSettings = settings;
    const nextSettings = { ...(settings || {}), ...patch };
    setSettings(nextSettings);
    setSaving(true);
    setError("");

    try {
      const res = await client.patch("/api/assignments/settings", patch);
      setSettings(res.data);
    } catch (err) {
      setSettings(previousSettings);
      setError(err.response?.data?.detail || t("assignment.updateError"));
    } finally {
      setSaving(false);
    }
  };

  const openRuleDialog = (type, key, title, currentValue) => {
    if (!autoAssignEnabled || saving) return;
    setRuleDialog({ type, key, title });
    setDraftEmployeeIds(normalizeRuleAssignees(currentValue));
  };

  const closeRuleDialog = () => {
    setRuleDialog(null);
    setDraftEmployeeIds([]);
  };

  const toggleDraftEmployee = (employeeId) => {
    const value = String(employeeId);
    setDraftEmployeeIds((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const selectLabelRule = (label) => {
    const labelId = String(label.id);
    setSelectedLabelId(labelId);
    setLabelDraftEmployeeIds(
      normalizeRuleAssignees(settings?.label_assignment_rules?.[labelId]),
    );
    setLabelPickerOpen(false);
  };

  const toggleLabelDraftEmployee = (employeeId) => {
    const value = String(employeeId);
    setLabelDraftEmployeeIds((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const saveRule = async () => {
    if (!ruleDialog) return;
    const ruleKey =
      ruleDialog.type === "channel"
        ? "channel_assignment_rules"
        : "label_assignment_rules";
    await patchSettings({
      [ruleKey]: {
        ...(settings?.[ruleKey] || {}),
        [ruleDialog.key]: draftEmployeeIds.length ? draftEmployeeIds : null,
      },
    });
    closeRuleDialog();
  };

  const saveSelectedLabelRule = async () => {
    if (!selectedLabelId || !autoAssignEnabled || saving) return;
    await patchSettings({
      label_assignment_rules: {
        ...(settings?.label_assignment_rules || {}),
        [selectedLabelId]: labelDraftEmployeeIds.length
          ? labelDraftEmployeeIds
          : null,
      },
    });
  };

  const getRuleSummary = (value) => {
    const ids = normalizeRuleAssignees(value);
    if (ids.length === 0) return t("assignment.allEmployees");
    return (
      ids
        .map((id) => employeeNameById[id])
        .filter(Boolean)
        .join(", ") || t("assignment.selectedCount", { count: ids.length })
    );
  };

  const renderStat = (
    icon,
    label,
    value,
    { featured = false, tone = colors.primary, toneBg = colors.primarySoft } = {},
  ) => (
    <Surface
      mode="flat"
      style={[styles.statCard, featured ? styles.statCardFeatured : null]}
    >
      <View
        style={[
          styles.statIcon,
          featured ? styles.statIconFeatured : null,
          { backgroundColor: toneBg },
        ]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={featured ? 26 : 20}
          color={tone}
        />
      </View>
      <View style={styles.statText}>
        <Text
          variant={featured ? "headlineMedium" : "titleLarge"}
          numberOfLines={1}
          style={[styles.statValue, featured ? styles.statValueFeatured : null]}
        >
          {value ?? 0}
        </Text>
        <Text
          variant="bodySmall"
          numberOfLines={2}
          style={styles.statLabel}
        >
          {label}
        </Text>
      </View>
    </Surface>
  );

  const renderRuleCard = ({
    icon,
    color,
    title,
    subtitle,
    onPress,
    disabled,
    ruleKey,
  }) => (
    <Surface
      key={ruleKey}
      mode="flat"
      style={[styles.ruleCard, disabled ? styles.disabledCard : null]}
    >
      <View style={styles.ruleHeader}>
        <View
          style={[
            styles.ruleIcon,
            { backgroundColor: color || colors.primary },
          ]}
        >
          <MaterialCommunityIcons name={icon} size={20} color="#fff" />
        </View>
        <View style={styles.ruleText}>
          <Text variant="titleSmall" numberOfLines={1} style={styles.ruleTitle}>
            {title}
          </Text>
          <Text
            variant="bodySmall"
            numberOfLines={2}
            style={styles.ruleSubtitle}
          >
            {subtitle}
          </Text>
        </View>
      </View>
      <Button
        mode="outlined"
        compact
        icon="account-multiple-check"
        disabled={disabled}
        onPress={onPress}
        style={styles.ruleButton}
      >
        {t("assignment.selectEmployees")}
      </Button>
    </Surface>
  );

  const renderContent = () => {
    if (!isBusiness) {
      return (
        <View style={styles.center}>
          <Text variant="titleMedium" style={styles.permissionTitle}>
            {t("assignment.noPermissionTitle")}
          </Text>
          <Text variant="bodySmall" style={styles.permissionText}>
            {t("assignment.noPermissionText")}
          </Text>
        </View>
      );
    }

    if (loading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      );
    }

    return (
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchCenter({ refresh: true })}
          />
        }
      >
        <View style={styles.hero}>
          <Text style={styles.subtitle}>{t("assignment.subtitle")}</Text>
        </View>

        {error ? (
          <Surface mode="flat" style={styles.errorBox}>
            <Text variant="bodySmall" style={styles.errorText}>
              {error}
            </Text>
          </Surface>
        ) : null}

        <View style={styles.statsGrid}>
          {renderStat(
            "source-branch",
            t("assignment.totalConversations"),
            overview?.total_conversations,
            { featured: true, toneBg: colors.surface },
          )}
          <View style={styles.statMiniRow}>
            {renderStat(
              "account-question-outline",
              t("assignment.unassignedConversations"),
              overview?.unassigned_count,
              { tone: colors.danger, toneBg: colors.dangerBg },
            )}
            {renderStat(
              "storefront-outline",
              t("assignment.businessAssignedConversations"),
              overview?.business_assigned_count,
              { tone: colors.success, toneBg: colors.successBg },
            )}
          </View>
        </View>

        <Surface mode="flat" style={styles.panel}>
          <View style={styles.panelHeader}>
            <View>
              <Text variant="titleMedium" style={styles.panelTitle}>
                {t("assignment.autoAssignmentSection")}
              </Text>
              <Text variant="bodySmall" style={styles.panelHint}>
                {t("assignment.generalSettings")}
              </Text>
            </View>
            <Button
              compact
              icon="refresh"
              loading={refreshing}
              onPress={() => fetchCenter({ refresh: true })}
            >
              {t("assignment.refresh")}
            </Button>
          </View>

          <SettingRow
            disabled={saving}
            label={t("assignment.lockTitle")}
            helper={t("assignment.lockDescription")}
            value={Boolean(settings?.employee_assignment_locked)}
            onValueChange={(value) =>
              patchSettings({ employee_assignment_locked: value })
            }
            styles={styles}
          />
          <Divider />
          <SettingRow
            disabled={saving}
            label={t("assignment.enableAutoAssign")}
            helper={t("assignment.autoAssignDescription")}
            value={autoAssignEnabled}
            onValueChange={(value) =>
              patchSettings({ auto_assign_enabled: value })
            }
            styles={styles}
          />

          <View style={styles.strategyBlock}>
            <Text variant="titleSmall" style={styles.sectionTitle}>
              {t("assignment.strategy")}
            </Text>
            <SegmentedButtons
              value={settings?.auto_assign_strategy || "round_robin"}
              onValueChange={(value) =>
                patchSettings({ auto_assign_strategy: value })
              }
              density="small"
              buttons={[
                {
                  value: "round_robin",
                  label: t("assignment.roundRobinShort"),
                  disabled: !autoAssignEnabled || saving,
                },
                {
                  value: "least_active",
                  label: t("assignment.leastActiveShort"),
                  disabled: !autoAssignEnabled || saving,
                },
              ]}
            />
            <Text variant="bodySmall" style={styles.panelHint}>
              {(settings?.auto_assign_strategy || "round_robin") ===
              "least_active"
                ? t("assignment.leastActive")
                : t("assignment.roundRobinActive")}
            </Text>
          </View>
        </Surface>

        <Surface mode="flat" style={styles.panel}>
          <View
            style={[
              styles.panelHeader,
              overviewExpanded ? null : styles.panelHeaderCollapsed,
            ]}
          >
            <Text variant="titleMedium" style={styles.panelTitle}>
              {t("assignment.overviewTitle")}
            </Text>
            <Button
              compact
              icon={overviewExpanded ? "chevron-up" : "chevron-down"}
              onPress={() => setOverviewExpanded((current) => !current)}
              style={styles.overviewToggle}
            >
              {t("assignment.employeeCount", {
                count: overview?.employee_assigned?.length || 0,
              })}
            </Button>
          </View>
          {overviewExpanded ? (
            (overview?.employee_assigned || []).length === 0 ? (
              <Text variant="bodySmall" style={styles.emptyText}>
                {t("assignment.noEmployees")}
              </Text>
            ) : (
              overview.employee_assigned.map((employee) => (
                <View
                  key={String(employee.assignee_id)}
                  style={styles.employeeRow}
                >
                  <View style={styles.employeeInfo}>
                    <Text
                      variant="bodyMedium"
                      numberOfLines={1}
                      style={styles.employeeName}
                    >
                      {employee.name}
                    </Text>
                    <Text
                      variant="bodySmall"
                      numberOfLines={1}
                      style={styles.employeeEmail}
                    >
                      {employee.email}
                    </Text>
                  </View>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{employee.count}</Text>
                  </View>
                </View>
              ))
            )
          ) : null}
        </Surface>

        <View style={styles.sectionIntro}>
          <Text variant="titleMedium" style={styles.panelTitle}>
            {t("assignment.routingRules")}
          </Text>
          <Text variant="bodySmall" style={styles.panelHint}>
            {autoAssignEnabled
              ? t("assignment.routingRulesDescription")
              : t("assignment.routingRulesDisabledDescription")}
          </Text>
        </View>

        <Surface mode="flat" style={styles.infoBox}>
          <MaterialCommunityIcons
            name="information-outline"
            size={20}
            color={colors.primary}
          />
          <Text variant="bodySmall" style={styles.infoText}>
            {t("assignment.conflictResolutionDescription")}
          </Text>
        </Surface>

        <View style={styles.ruleSection}>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            {t("assignment.byChannel")}
          </Text>
          {PLATFORM_RULES.map((platform) =>
            renderRuleCard({
              ruleKey: `channel-${platform.key}`,
              icon: platform.icon,
              color: platform.color,
              title: platform.label,
              subtitle: getRuleSummary(
                settings?.channel_assignment_rules?.[platform.key],
              ),
              disabled: !autoAssignEnabled || saving,
              onPress: () =>
                openRuleDialog(
                  "channel",
                  platform.key,
                  platform.label,
                  settings?.channel_assignment_rules?.[platform.key],
                ),
            }),
          )}
        </View>

        <View style={styles.ruleSection}>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            {t("assignment.byLabel")}
          </Text>
          {labels.length === 0 ? (
            <Surface mode="flat" style={styles.emptyBox}>
              <Text variant="bodySmall" style={styles.emptyText}>
                {t("assignment.noLabels")}
              </Text>
            </Surface>
          ) : (
            <Surface
              mode="flat"
              style={[
                styles.labelRulePanel,
                !autoAssignEnabled || saving ? styles.disabledCard : null,
              ]}
            >
              <View style={styles.labelPickerRow}>
                <View style={styles.labelPickerText}>
                  <Text variant="bodySmall" style={styles.panelHint}>
                    {t("assignment.selectedLabel")}
                  </Text>
                  <Text
                    variant="titleSmall"
                    numberOfLines={1}
                    style={styles.ruleTitle}
                  >
                    {selectedLabel?.name || t("assignment.noLabelSelected")}
                  </Text>
                </View>
                <Button
                  mode="outlined"
                  compact
                  icon="tag"
                  disabled={!autoAssignEnabled || saving}
                  onPress={() => setLabelPickerOpen(true)}
                  style={styles.labelChooseButton}
                >
                  {t("assignment.chooseLabel")}
                </Button>
              </View>

              {selectedLabel ? (
                <View style={styles.labelEmployeeBlock}>
                  <View style={styles.selectedLabelSummary}>
                    <View
                      style={[
                        styles.ruleIcon,
                        {
                          backgroundColor:
                            selectedLabel.color || colors.primary,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="tag"
                        size={18}
                        color="#fff"
                      />
                    </View>
                    <View style={styles.ruleText}>
                      <Text
                        variant="titleSmall"
                        numberOfLines={1}
                        style={styles.ruleTitle}
                      >
                        {selectedLabel.name}
                      </Text>
                      <Text
                        variant="bodySmall"
                        numberOfLines={2}
                        style={styles.ruleSubtitle}
                      >
                        {getRuleSummary(
                          settings?.label_assignment_rules?.[selectedLabelId],
                        )}
                      </Text>
                    </View>
                  </View>

                  <Text variant="titleSmall" style={styles.sectionTitle}>
                    {t("assignment.selectEmployees")}
                  </Text>
                  {employeeOptions.length === 0 ? (
                    <Text style={styles.emptyText}>
                      {t("assignment.noActiveEmployees")}
                    </Text>
                  ) : (
                    <View style={styles.employeeChecklist}>
                      {employeeOptions.map((employee) => (
                        <Checkbox.Item
                          key={String(employee.id)}
                          label={employee.name}
                          status={
                            labelDraftEmployeeIds.includes(String(employee.id))
                              ? "checked"
                              : "unchecked"
                          }
                          onPress={() => toggleLabelDraftEmployee(employee.id)}
                          disabled={!autoAssignEnabled || saving}
                          labelStyle={styles.checkboxLabel}
                        />
                      ))}
                    </View>
                  )}

                  <View style={styles.inlineActions}>
                    <Button
                      onPress={() => setLabelDraftEmployeeIds([])}
                      disabled={!autoAssignEnabled || saving}
                    >
                      {t("common.clear")}
                    </Button>
                    <Button
                      mode="contained"
                      loading={saving}
                      disabled={
                        !autoAssignEnabled ||
                        saving ||
                        employeeOptions.length === 0
                      }
                      onPress={saveSelectedLabelRule}
                    >
                      {t("common.confirm")}
                    </Button>
                  </View>
                </View>
              ) : null}
            </Surface>
          )}
        </View>

        {employeeOptions.length === 0 ? (
          <Surface mode="flat" style={styles.infoBox}>
            <MaterialCommunityIcons
              name="account-alert-outline"
              size={20}
              color={colors.primary}
            />
            <Text variant="bodySmall" style={styles.infoText}>
              {t("assignment.noActiveEmployees")}
            </Text>
          </Surface>
        ) : null}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <Appbar.Header mode="small" elevated>
        <Appbar.Content
          title="ChatDesk"
          subtitle={user?.business_name || user?.email}
          titleStyle={styles.brandTitle}
        />
      </Appbar.Header>

      {renderContent()}

      <Portal>
        <Dialog visible={Boolean(ruleDialog)} onDismiss={closeRuleDialog}>
          <Dialog.Title>
            {ruleDialog?.title || t("assignment.selectEmployees")}
          </Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={styles.dialogContent}>
              {employeeOptions.length === 0 ? (
                <Text style={styles.emptyText}>
                  {t("assignment.noActiveEmployees")}
                </Text>
              ) : (
                employeeOptions.map((employee) => (
                  <Checkbox.Item
                    key={String(employee.id)}
                    label={employee.name}
                    status={
                      draftEmployeeIds.includes(String(employee.id))
                        ? "checked"
                        : "unchecked"
                    }
                    onPress={() => toggleDraftEmployee(employee.id)}
                    disabled={saving}
                    labelStyle={styles.checkboxLabel}
                  />
                ))
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setDraftEmployeeIds([])} disabled={saving}>
              {t("common.clear")}
            </Button>
            <Button onPress={closeRuleDialog} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button loading={saving} disabled={saving} onPress={saveRule}>
              {t("common.save")}
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={labelPickerOpen}
          onDismiss={() => setLabelPickerOpen(false)}
        >
          <Dialog.Title>{t("assignment.chooseLabel")}</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={styles.dialogContent}>
              {labels.map((label) => {
                const selected = String(label.id) === String(selectedLabelId);
                return (
                  <Button
                    key={String(label.id)}
                    mode={selected ? "contained-tonal" : "text"}
                    icon="tag"
                    disabled={saving}
                    onPress={() => selectLabelRule(label)}
                    contentStyle={styles.labelPickerButtonContent}
                    style={styles.labelPickerButton}
                  >
                    {label.name}
                  </Button>
                );
              })}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setLabelPickerOpen(false)} disabled={saving}>
              {t("common.cancel")}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <BottomNavBar active="Assignments" navigation={navigation} />
    </View>
  );
}

function SettingRow({ disabled, helper, label, onValueChange, styles, value }) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingText}>
        <Text variant="titleSmall" style={styles.sectionTitle}>
          {label}
        </Text>
        <Text variant="bodySmall" style={styles.panelHint}>
          {helper}
        </Text>
      </View>
      <Switch value={value} disabled={disabled} onValueChange={onValueChange} />
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    brandTitle: {
      color: colors.primary,
      fontWeight: "800",
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    permissionTitle: {
      color: colors.text,
      fontWeight: "700",
    },
    permissionText: {
      color: colors.muted,
      marginTop: 6,
      textAlign: "center",
    },
    content: {
      gap: 12,
      padding: 16,
      paddingBottom: 92,
    },
    hero: {
      gap: 4,
    },
    title: {
      color: colors.text,
      fontSize: 30,
      fontWeight: "800",
    },
    subtitle: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 20,
    },
    errorBox: {
      borderRadius: 8,
      padding: 12,
      backgroundColor: colors.errorBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.errorBorder,
    },
    errorText: {
      color: colors.danger,
    },
    statsGrid: {
      gap: 10,
    },
    statMiniRow: {
      flexDirection: "row",
      gap: 10,
    },
    statCard: {
      flex: 1,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      borderRadius: 8,
      padding: 12,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    statCardFeatured: {
      alignItems: "center",
      padding: 16,
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    statIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    statIconFeatured: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surface,
    },
    statText: {
      flex: 1,
      minWidth: 0,
    },
    statValue: {
      color: colors.text,
      fontWeight: "800",
    },
    statValueFeatured: {
      color: colors.primary,
    },
    statLabel: {
      color: colors.muted,
      marginTop: 1,
      lineHeight: 16,
    },
    panel: {
      borderRadius: 8,
      padding: 14,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    panelHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 10,
    },
    panelHeaderCollapsed: {
      marginBottom: 0,
    },
    panelTitle: {
      color: colors.text,
      fontWeight: "800",
    },
    panelHint: {
      color: colors.muted,
      lineHeight: 18,
    },
    settingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 14,
      paddingVertical: 10,
    },
    settingText: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    sectionTitle: {
      color: colors.text,
      fontWeight: "700",
    },
    strategyBlock: {
      gap: 8,
      paddingTop: 12,
    },
    countText: {
      color: colors.muted,
    },
    overviewToggle: {
      alignSelf: "flex-start",
      borderRadius: 8,
    },
    employeeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    employeeInfo: {
      flex: 1,
      minWidth: 0,
    },
    employeeName: {
      color: colors.text,
      fontWeight: "700",
    },
    employeeEmail: {
      color: colors.muted,
      marginTop: 2,
    },
    countBadge: {
      minWidth: 34,
      alignItems: "center",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: colors.primarySoft,
    },
    countBadgeText: {
      color: colors.primary,
      fontWeight: "800",
    },
    sectionIntro: {
      gap: 4,
      marginTop: 2,
    },
    infoBox: {
      flexDirection: "row",
      gap: 10,
      borderRadius: 8,
      padding: 12,
      backgroundColor: colors.softSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    infoText: {
      flex: 1,
      color: colors.text,
      lineHeight: 18,
    },
    ruleSection: {
      gap: 10,
    },
    ruleCard: {
      borderRadius: 8,
      padding: 12,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    disabledCard: {
      opacity: 0.58,
    },
    ruleHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    ruleIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    ruleText: {
      flex: 1,
      minWidth: 0,
    },
    ruleTitle: {
      color: colors.text,
      fontWeight: "700",
    },
    ruleSubtitle: {
      color: colors.muted,
      marginTop: 2,
    },
    ruleButton: {
      alignSelf: "flex-start",
      borderRadius: 8,
      marginTop: 10,
    },
    labelChooseButton: {
      alignSelf: "center",
      borderRadius: 8,
    },
    labelRulePanel: {
      borderRadius: 8,
      padding: 12,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    labelPickerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    labelPickerText: {
      flex: 1,
      minWidth: 0,
    },
    labelEmployeeBlock: {
      gap: 10,
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    selectedLabelSummary: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    employeeChecklist: {
      borderRadius: 8,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    inlineActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
    },
    labelPickerButton: {
      alignItems: "stretch",
      borderRadius: 8,
    },
    labelPickerButtonContent: {
      justifyContent: "flex-start",
    },
    emptyBox: {
      borderRadius: 8,
      padding: 16,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    emptyText: {
      color: colors.muted,
      textAlign: "center",
    },
    dialogContent: {
      paddingVertical: 8,
    },
    checkboxLabel: {
      color: colors.text,
    },
  });
