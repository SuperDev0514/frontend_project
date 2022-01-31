import chroma from "chroma-js";
import { observer } from "mobx-react";
import Tree from 'rc-tree';
import { FC, useCallback, useMemo, useState } from "react";
import { LsSparks } from "../../../assets/icons";
import { IconEyeClosed, IconEyeOpened } from "../../../assets/icons/timeline";
import { IconArrow } from "../../../assets/icons/tree";
import { Button, ButtonProps } from "../../../common/Button/Button";
import { Block, CN, cn, Elem } from "../../../utils/bem";
import { flatten, isDefined, isMacOS } from "../../../utils/utilities";
import { NodeIcon } from "../../Node/Node";
import "./TreeView.styl";
import { GroupingOptions, OrderingOptions } from "./ViewControls";

interface OutlinerTreeProps {
  regions: any;
  grouping: GroupingOptions | null;
  ordering: OrderingOptions | null;
  selectedKeys: string[];
}

const OutlinerTreeComponent: FC<OutlinerTreeProps> = ({
  regions,
  grouping,
  ordering,
  selectedKeys,
}) => {
  const rootClass = cn('tree');
  const [hovered, setHovered] = useState<string | null>(null);
  const onHover = (hovered: boolean, id: string) => setHovered(hovered ? id : null);

  const eventHandlers = useEventHandlers({ regions, onHover });
  const regionsTree = useDataTree({ regions, hovered, rootClass });

  return (
    <Block name="outliner-tree">
      <Tree
        draggable
        multiple
        defaultExpandAll
        defaultExpandParent
        checkable={false}
        prefixCls="lsf-tree"
        className={rootClass.toClassName()}
        treeData={regionsTree}
        selectedKeys={selectedKeys}
        icon={({ item }: any) => <NodeIconComponent node={item}/>}
        switcherIcon={({ isLeaf }: any) => <SwitcherIcon isLeaf={isLeaf}/>}
        {...eventHandlers}
      />
    </Block>
  );
};

const useDataTree = ({
  regions,
  hovered,
  rootClass,
}: any) => {
  const createResult = useCallback((item) => {
    return {
      key: item.id,
      hovered: item.id === hovered,
      title: (data: any) => {
        return <RootTitle {...data}/>;
      },
    };
  }, [hovered]);

  const processor = useCallback((item: any) => {
    const result: any = createResult(item);

    const toName = item.labeling?.to_name;
    const groupType = toName?.type;
    const groupLabel = toName?.parsedValue ?? toName?.value;

    const color = chroma(item.getOneColor()).alpha(1);
    const mods: Record<string, any> = {};

    if (item.hidden) mods.hidden = true;

    const classNames = rootClass.elem('node').mod(mods);

    result.color = color.css();
    result.style = {
      '--icon-color': color.css(),
      '--text-color': color.css(),
      '--selection-color': color.alpha(0.1).css(),
    };
    result.className = classNames.toClassName();


    if (groupType && groupLabel) {
      result.group = {
        title: groupLabel,
        type: groupType,
      };
    }

    return result;
  }, [createResult]);

  return regions.asTree(processor);
};

const useEventHandlers = ({
  regions,
  onHover,
}: {
  regions: any,
  onHover: (hovered: boolean, id: string) => void,
}) => {
  const onSelect = useCallback((_, evt) => {
    const multi = evt.nativeEvent.ctrlKey || (isMacOS() && evt.nativeEvent.metaKey);
    const { node, selected } = evt;

    if (!multi) regions.selection.clear();

    if (selected) regions.selection.select(node.item);
    else regions.selection.unselect(node.item);
  }, []);

  const onMouseEnter = useCallback(({ node }: any) => {
    onHover(true, node.key);
    node.item.setHighlight(true);
  }, []);

  const onMouseLeave = useCallback(({ node }: any) => {
    onHover(false, node.key);
    node.item.setHighlight(false);
  }, []);


  // find the height of the tree formed by dragReg for
  // example if we have a tree of A -> B -> C -> D and
  // we're moving B -> C part somewhere then it'd have a
  // height of 1
  const treeHeight = useCallback((node: any): number => {
    if (!node) return 0;

    // TODO this can blow up if we have lots of stuff there
    const nodes: any[] = regions.filterByParentID(node.pid);
    const childrenHeight = nodes.map(c => treeHeight(c));

    if (!childrenHeight.length) return 0;

    return 1 + Math.max(...childrenHeight);
  }, []);

  const onDrop = useCallback(({ node, dragNode, dropPosition, dropToGap }) => {
    if (node.classification) return false;
    const dropKey = node.props.eventKey;
    const dragKey = dragNode.props.eventKey;
    const dropPos = node.props.pos.split("-");

    dropPosition = dropPosition - parseInt(dropPos[dropPos.length - 1]);
    const treeDepth = dropPos.length;

    const dragReg = regions.findRegionID(dragKey);
    const dropReg = regions.findRegionID(dropKey);

    regions.unhighlightAll();

    if (treeDepth === 2 && dropToGap && dropPosition === -1) {
      dragReg.setParentID("");
    } else if (dropPosition !== -1) {
      // check if the dragReg can be a child of dropReg
      const selDrop: any[] = dropReg.labeling?.selectedLabels || [];
      const labelWithConstraint = selDrop.filter(l => l.groupcancontain);

      if (labelWithConstraint.length) {
        const selDrag: any[] = dragReg.labeling.selectedLabels;

        const set1 = flatten(labelWithConstraint.map(l => l.groupcancontain.split(",")));
        const set2 = flatten(selDrag.map(l => (l.alias ? [l.alias, l.value] : [l.value])));

        if (set1.filter(value => -1 !== set2.indexOf(value)).length === 0) return;
      }

      // check drop regions tree depth
      if (dropReg.labeling?.from_name?.groupdepth) {
        let maxDepth = Number(dropReg.labeling.from_name.groupdepth);

        if (maxDepth >= 0) {
          maxDepth = maxDepth - treeHeight(dragReg);
          let reg = dropReg;

          while (reg) {
            reg = regions.findRegion(reg.parentID);
            maxDepth = maxDepth - 1;
          }

          if (maxDepth < 0) return;
        }
      }

      dragReg.setParentID(dropReg.id);
    }
  }, []);

  return {
    onSelect,
    onMouseEnter,
    onMouseLeave,
    onDrop,
  };
};

const SwitcherIcon: FC<any> = observer(({ isLeaf }) => {
  return isLeaf ? null : <IconArrow/>;
});

const NodeIconComponent: FC<any> = observer(({ node }) => {
  return node ? <NodeIcon node={node}/> : null;
});

const RootTitle: FC<any> = observer(({
  item,
  hovered,
  ...props
}) => {
  const title = useMemo(() => {
    return item.labels.join(", ") || "No label";
  }, [item.labels]);

  return (
    <Block name="region-item">
      <Elem name="title">{title}</Elem>
      <RegionControls hovered={hovered} item={item}/>
    </Block>
  );
});

const RegionControls: FC<{hovered: boolean, item: any}> = observer(({ hovered, item }) => {
  return (
    <Elem name="controls">
      <Elem name="control" mod={{ type: "score" }}>
        {isDefined(item.score) && item.score.toFixed(2)}
      </Elem>
      <Elem name="control" mod={{ type: "dirty" }}>
        {/* dirtyness is not implemented yet */}
      </Elem>
      <Elem name="control" mod={{ type: "predict" }}>
        {item.origin === 'prediction' && (
          <LsSparks style={{ width: 18, height: 18 }}/>
        )}
      </Elem>
      <Elem name="control" mod={{ type: "lock" }}>
        {/* locking is not implemented yet */}
      </Elem>
      <Elem name="control" mod={{ type: "visibility" }}>
        {(hovered || item.hidden) && (
          <RegionControlButton onClick={item.toggleHidden}>
            {item.hidden ? <IconEyeClosed/> : <IconEyeOpened/>}
          </RegionControlButton>
        )}
      </Elem>
    </Elem>
  );
});

const RegionControlButton: FC<ButtonProps> = ({ children, onClick, ...props }) => {
  return (
    <Button
      {...props}
      onClick={(e) => {
        e.stopPropagation(),
        onClick?.(e);
      }}
      type="text"
      style={{ padding: 0, width: 24, height: 24 }}
    >
      {children}
    </Button>
  );
};


export const OutlinerTree = observer(OutlinerTreeComponent);
