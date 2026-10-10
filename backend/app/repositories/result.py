import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from datetime import datetime                                       #引用"日期时间"这个工具。(记录时间)
from typing import List                                             #引入 List 这个类型标注工具 (确认是使用List)
from sqlalchemy import func,select                                  #从 SQLAlchemy（操作数据库的工具）(使用SQL语句)
from sqlalchemy.orm import Session                                  #引入"数据库会话"这个东西(日后连接数据库)
from app.models import BallotChoice, Election, ElectionCandidate    #从你项目的 app/models/ 里引入三张数据表的"模型类"。(明确表格)

#票数统计大类
class CandidateResult:
    #设置属性票数和参选人id
    def _init_(self, candidate_id:int,votes:int):
        self.candidate_id=candidate_id
        self.votes=votes

#设置数票大类
class SqlAlchemyResultRepository:
    def _init_(self,session):
        self.session=session 

    #设置数票机制
    def getTotalVote(self,election_id):
        candidates=self.session.query(ElectionCandidate).filter(
            ElectionCandidate.election_id==election_id
        ).all()
        #设置候选人信息票数集合
        results=[]
        #正式数票机制
        for c in candidates:
            vote_count=self.session.query(BallotChoice).filter(
                BallotChoice.candidate_id == c.id
            ).count()
        #放入结果列表中
        results.append(CandidateResult(candidate_id=c.id,
                                      votes=vote_count))
        return results
    #获取选举状态
    def get_status(self,election_id):
        election=self.session.query(Election).filter(
            Election.id==election_id
        ).first
        return election
    #设置最新发布时间
    def publish(self,election_id):
        #先读取
        election=self.session_query(Election).filter(
            Election.id==election_id
        ).first()
        #后更改
        #如果election变量有东西，就继续执行下方代码
        if election:
            election.results_published_at=datetime.now()
            self.session.flush()