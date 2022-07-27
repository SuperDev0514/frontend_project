import { FC, useEffect } from "react";
import { observer } from "mobx-react";
import { Block } from "../../utils/bem";
import { CommentForm } from "./CommentForm";
import { CommentsList } from "./CommentsList";
import { useMounted } from "../../common/Utils/useMounted";

import './Comments.styl';


export const Comments: FC<{ commentStore: any, cacheKey?: string }>= observer(({ commentStore, cacheKey }) => {
  const mounted = useMounted();

  const loadComments = async () => {
    await commentStore.listComments({ mounted });
    commentStore.restoreCommentsFromCache(cacheKey);
  };

  useEffect(() => {
    loadComments();
  }, [commentStore.parentId, cacheKey]);

  useEffect(() => {
    const confirmCommentsLoss = (e: any) => {

      if (commentStore.hasUnsaved) {
        e.returnValue = "You have unpersisted comments which will be lost if continuing.";
      }

      return e;
    };

    // Need to handle this entirely separate to client-side based navigation
    window.addEventListener("beforeunload", confirmCommentsLoss);
    return () => {
      window.removeEventListener("beforeunload", confirmCommentsLoss);
    };
  }, [commentStore.hasUnsaved]);

  return (
    <Block name="comments">
      <CommentForm commentStore={commentStore} inline />
      <CommentsList commentStore={commentStore} />
    </Block>
  );
});
